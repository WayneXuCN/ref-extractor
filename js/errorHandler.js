/**
 * @fileoverview 错误处理系统 - 提供统一的错误捕获、处理和报告功能
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor错误处理器
 * 提供统一的错误处理、分类和恢复机制
 */
window.RefExtractorErrorHandler = (function() {
    'use strict';

    // 私有变量
    let errorHistory = [];
    let errorCallbacks = new Map();
    let isInitialized = false;

    /**
     * 获取配置的辅助函数
     * @param {string} path - 配置路径
     * @param {*} defaultValue - 默认值
     * @returns {*} 配置值
     */
    function getConfig(path, defaultValue) {
        if (window.RefExtractorConfig && window.RefExtractorConfig.get) {
            return window.RefExtractorConfig.get(path, defaultValue);
        }
        return defaultValue;
    }

    /**
     * 获取日志器实例
     * @returns {object} 日志器对象
     */
    function getLogger() {
        return window.RefExtractorLogger || {
            error: console.error.bind(console),
            warn: console.warn.bind(console),
            info: console.info.bind(console),
            debug: console.log.bind(console)
        };
    }

    /**
     * 创建标准化错误对象 (私有函数)
     * @param {number} code - 错误代码
     * @param {string} message - 错误消息
     * @param {Error|object} originalError - 原始错误对象
     * @param {object} context - 错误上下文
     * @returns {object} 标准化错误对象
     */
    function createStandardErrorInternal(code, message, originalError = null, context = {}) {
        const error = {
            id: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            code: code,
            message: message,
            timestamp: new Date().toISOString(),
            context: context,
            stack: null,
            severity: getSeverityFromCode(code),
            category: getCategoryFromCode(code),
            recoverable: isRecoverableError(code),
            userMessage: getUserFriendlyMessage(code, message)
        };

        // 添加原始错误信息
        if (originalError) {
            if (originalError instanceof Error) {
                error.originalMessage = originalError.message;
                error.stack = originalError.stack;
                error.name = originalError.name;
            } else {
                error.originalData = originalError;
            }
        }

        // 添加浏览器和环境信息
        error.environment = {
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: Date.now()
        };

        return error;
    }

    /**
     * 根据错误代码获取严重程度
     * @param {number} code - 错误代码
     * @returns {string} 严重程度等级
     */
    function getSeverityFromCode(code) {
        if (code >= 9000) return 'critical';
        if (code >= 5000) return 'high';
        if (code >= 3000) return 'medium';
        if (code >= 1000) return 'low';
        return 'info';
    }

    /**
     * 根据错误代码获取分类
     * @param {number} code - 错误代码
     * @returns {string} 错误分类
     */
    function getCategoryFromCode(code) {
        const ranges = {
            'file': [1000, 1999],
            'xml': [2000, 2999],
            'citation': [3000, 3999],
            'ui': [4000, 4999],
            'network': [5000, 5999],
            'unknown': [9000, 9999]
        };

        for (const [category, [min, max]] of Object.entries(ranges)) {
            if (code >= min && code <= max) {
                return category;
            }
        }

        return 'unknown';
    }

    /**
     * 判断错误是否可恢复
     * @param {number} code - 错误代码
     * @returns {boolean} 是否可恢复
     */
    function isRecoverableError(code) {
        const nonRecoverableCodes = [
            getConfig('ERROR_CODES.CORRUPTED_ZIP', 1004),
            getConfig('ERROR_CODES.INVALID_FILE_TYPE', 1003),
            getConfig('ERROR_CODES.UNKNOWN_ERROR', 9999)
        ];

        return !nonRecoverableCodes.includes(code);
    }

    /**
     * 获取用户友好的错误消息
     * @param {number} code - 错误代码
     * @param {string} technicalMessage - 技术错误消息
     * @returns {string} 用户友好的错误消息
     */
    function getUserFriendlyMessage(code, technicalMessage) {
        const messages = getConfig('MESSAGES.ERRORS', {});
        const errorCodes = getConfig('ERROR_CODES', {});

        // 根据错误代码映射用户友好消息
        const codeMessageMap = {
            [errorCodes.FILE_READ_ERROR]: messages.FILE_READ_FAILED || '无法读取文件，请检查文件是否损坏',
            [errorCodes.INVALID_FILE_TYPE]: messages.INVALID_DOCUMENT_TYPE || '不支持的文件类型，请选择.docx或.odt文件',
            [errorCodes.XML_PARSE_ERROR]: messages.PARSING_FAILED || '文档解析失败，请检查文件格式',
            [errorCodes.CITATION_PARSE_ERROR]: messages.NO_REFERENCES_FOUND || '未找到有效的引用信息',
            [errorCodes.CITATION_JS_ERROR]: messages.NETWORK_ERROR || '引用处理服务异常'
        };

        return codeMessageMap[code] || messages.UNKNOWN_ERROR || '操作失败，请重试';
    }

    /**
     * 存储错误历史
     * @param {object} error - 错误对象
     */
    function storeError(error) {
        if (!getConfig('DEBUG.STORE_ERRORS', true)) {
            return;
        }

        errorHistory.push(error);

        // 限制错误历史数量
        const maxHistory = getConfig('DEBUG.MAX_ERROR_HISTORY', 50);
        if (errorHistory.length > maxHistory) {
            errorHistory = errorHistory.slice(-maxHistory);
        }

        // 分发错误事件
        window.dispatchEvent(new CustomEvent('refextractor:error', {
            detail: error
        }));
    }

    /**
     * 尝试错误恢复
     * @param {object} error - 错误对象
     * @returns {boolean} 是否成功恢复
     */
    function attemptRecovery(error) {
        if (!error.recoverable) {
            return false;
        }

        const logger = getLogger();
        logger.info('Attempting error recovery', { errorId: error.id, code: error.code });

        try {
            // 根据错误类型执行恢复策略
            switch (error.category) {
                case 'file':
                    return recoverFileError(error);
                case 'xml':
                    return recoverXmlError(error);
                case 'citation':
                    return recoverCitationError(error);
                case 'ui':
                    return recoverUiError(error);
                default:
                    return false;
            }
        } catch (recoveryError) {
            logger.error('Error recovery failed', {
                originalError: error,
                recoveryError: recoveryError.message
            });
            return false;
        }
    }

    /**
     * 文件错误恢复
     * @param {object} error - 错误对象
     * @returns {boolean} 是否成功恢复
     */
    function recoverFileError(error) {
        const logger = getLogger();
        
        // 尝试清理UI状态
        try {
            if (window.RefExtractorUI && window.RefExtractorUI.resetToInitialState) {
                window.RefExtractorUI.resetToInitialState();
                logger.info('UI state reset after file error');
                return true;
            }
        } catch (e) {
            logger.warn('Failed to reset UI state', e);
        }

        return false;
    }

    /**
     * XML错误恢复
     * @param {object} error - 错误对象
     * @returns {boolean} 是否成功恢复
     */
    function recoverXmlError(error) {
        // XML解析错误通常不可恢复，但可以尝试备用解析方法
        return false;
    }

    /**
     * 引用错误恢复
     * @param {object} error - 错误对象
     * @returns {boolean} 是否成功恢复
     */
    function recoverCitationError(error) {
        // 可以尝试降级处理
        return false;
    }

    /**
     * UI错误恢复
     * @param {object} error - 错误对象
     * @returns {boolean} 是否成功恢复
     */
    function recoverUiError(error) {
        const logger = getLogger();
        
        // 尝试重新绑定事件
        try {
            if (window.RefExtractorUI && window.RefExtractorUI.rebindEvents) {
                window.RefExtractorUI.rebindEvents();
                logger.info('UI events rebound after error');
                return true;
            }
        } catch (e) {
            logger.warn('Failed to rebind UI events', e);
        }

        return false;
    }

    // 公共API
    const ErrorHandler = {
        /**
         * 初始化错误处理系统
         * @param {object} options - 初始化选项
         */
        init(options = {}) {
            if (isInitialized) {
                return;
            }

            isInitialized = true;
            const logger = getLogger();
            
            logger.info('RefExtractor Error Handler initialized');

            // 设置全局错误监听器（如果Logger还没有设置）
            if (!window.refextractorErrorListenersSet) {
                window.addEventListener('error', (event) => {
                    this.handleError(
                        getConfig('ERROR_CODES.UNKNOWN_ERROR', 9999),
                        'Global JavaScript Error',
                        event.error || new Error(event.message),
                        {
                            filename: event.filename,
                            lineno: event.lineno,
                            colno: event.colno
                        }
                    );
                });

                window.addEventListener('unhandledrejection', (event) => {
                    this.handleError(
                        getConfig('ERROR_CODES.UNKNOWN_ERROR', 9999),
                        'Unhandled Promise Rejection',
                        event.reason,
                        { promise: event.promise }
                    );
                });

                window.refextractorErrorListenersSet = true;
            }
        },

        /**
         * 处理错误
         * @param {number} code - 错误代码
         * @param {string} message - 错误消息
         * @param {Error|object} originalError - 原始错误
         * @param {object} context - 错误上下文
         * @returns {object} 处理后的错误对象
         */
        handleError(code, message, originalError = null, context = {}) {
            const logger = getLogger();
            
            // 创建标准化错误对象
            const error = createStandardErrorInternal(code, message, originalError, context);
            
            // 记录错误
            logger.error(`[${error.category.toUpperCase()}] ${error.message}`, {
                errorId: error.id,
                code: error.code,
                severity: error.severity,
                context: error.context,
                recoverable: error.recoverable
            });

            // 存储错误
            storeError(error);

            // 尝试恢复
            if (error.recoverable) {
                const recovered = attemptRecovery(error);
                if (recovered) {
                    logger.info('Error recovery successful', { errorId: error.id });
                    error.recovered = true;
                }
            }

            // 执行注册的错误回调
            this.notifyErrorCallbacks(error);

            // 显示用户通知（如果适当）
            this.showUserNotification(error);

            return error;
        },

        /**
         * 注册错误回调
         * @param {string} category - 错误分类
         * @param {function} callback - 回调函数
         */
        onError(category, callback) {
            if (!errorCallbacks.has(category)) {
                errorCallbacks.set(category, []);
            }
            errorCallbacks.get(category).push(callback);
        },

        /**
         * 通知错误回调
         * @param {object} error - 错误对象
         */
        notifyErrorCallbacks(error) {
            const callbacks = errorCallbacks.get(error.category) || [];
            const allCallbacks = errorCallbacks.get('*') || [];
            
            [...callbacks, ...allCallbacks].forEach(callback => {
                try {
                    callback(error);
                } catch (callbackError) {
                    getLogger().warn('Error callback failed', {
                        originalError: error.id,
                        callbackError: callbackError.message
                    });
                }
            });
        },

        /**
         * 显示用户通知
         * @param {object} error - 错误对象
         */
        showUserNotification(error) {
            if (error.severity === 'critical' || error.severity === 'high') {
                // 显示用户可见的错误通知
                if (window.RefExtractorUI && window.RefExtractorUI.showError) {
                    window.RefExtractorUI.showError(error.userMessage, error.severity);
                } else {
                    // 备用通知方式
                    alert(`错误: ${error.userMessage}`);
                }
            }
        },

        /**
         * 创建错误对象（供其他模块使用）
         * @param {number} code - 错误代码
         * @param {string} message - 错误消息
         * @param {object} context - 错误上下文
         * @returns {object} 错误对象
         */
        createError(code, message, context = {}) {
            return createStandardErrorInternal(code, message, null, context);
        },

        /**
         * 获取错误历史
         * @param {object} filters - 过滤条件
         * @returns {array} 错误历史数组
         */
        getErrorHistory(filters = {}) {
            let history = [...errorHistory];

            if (filters.category) {
                history = history.filter(error => error.category === filters.category);
            }

            if (filters.severity) {
                history = history.filter(error => error.severity === filters.severity);
            }

            if (filters.since) {
                const sinceDate = new Date(filters.since);
                history = history.filter(error => new Date(error.timestamp) >= sinceDate);
            }

            return history;
        },

        /**
         * 清除错误历史
         */
        clearErrorHistory() {
            errorHistory = [];
            getLogger().info('Error history cleared');
        },

        /**
         * 获取错误统计信息
         * @returns {object} 错误统计
         */
        getErrorStats() {
            const stats = {
                total: errorHistory.length,
                byCategory: {},
                bySeverity: {},
                byRecoverable: { true: 0, false: 0 },
                recent: 0
            };

            const oneHourAgo = Date.now() - (60 * 60 * 1000);

            errorHistory.forEach(error => {
                // 按分类统计
                stats.byCategory[error.category] = (stats.byCategory[error.category] || 0) + 1;
                
                // 按严重程度统计
                stats.bySeverity[error.severity] = (stats.bySeverity[error.severity] || 0) + 1;
                
                // 按可恢复性统计
                stats.byRecoverable[error.recoverable] += 1;
                
                // 最近一小时的错误
                if (error.environment.timestamp > oneHourAgo) {
                    stats.recent += 1;
                }
            });

            return stats;
        },

        /**
         * 导出错误报告
         * @param {object} options - 导出选项
         * @returns {string} JSON格式的错误报告
         */
        exportErrorReport(options = {}) {
            const report = {
                metadata: {
                    exportTime: new Date().toISOString(),
                    version: getConfig('APP.VERSION', '1.0.0'),
                    url: window.location.href,
                    userAgent: navigator.userAgent
                },
                summary: this.getErrorStats(),
                errors: this.getErrorHistory(options.filters || {}),
                config: options.includeConfig ? {
                    errorCodes: getConfig('ERROR_CODES', {}),
                    debugConfig: getConfig('DEBUG', {})
                } : null
            };

            return JSON.stringify(report, null, 2);
        },

        /**
         * 创建标准化错误对象（公共接口）
         * @param {string|number} code - 错误代码
         * @param {string} message - 错误消息
         * @param {Error|object} originalError - 原始错误对象
         * @param {object} context - 错误上下文
         * @returns {object} 标准化错误对象
         */
        createStandardError(code, message, originalError = null, context = {}) {
            // 调用私有函数来创建错误对象
            const error = createStandardErrorInternal(code, message, originalError, context);
            
            // 添加到错误历史
            errorHistory.push(error);
            
            // 触发错误事件
            this.dispatchErrorEvent(error);
            
            return error;
        }
    };

    return ErrorHandler;
})();

// 自动初始化
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', function() {
        window.RefExtractorErrorHandler.init();
    });
}

// 导出模块（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorErrorHandler;
}
