/**
 * @fileoverview 日志记录系统 - 提供统一的日志记录、调试和性能监控功能
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor日志记录器
 * 提供分级日志记录、性能监控和调试信息收集功能
 */
window.RefExtractorLogger = (function() {
    'use strict';

    // 私有变量
    let logEntries = [];
    let performanceMarks = new Map();
    let memorySnapshots = [];
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
     * 格式化时间戳
     * @param {Date} date - 日期对象
     * @returns {string} 格式化的时间字符串
     */
    function formatTimestamp(date = new Date()) {
        return date.toISOString();
    }

    /**
     * 获取调用栈信息
     * @param {number} skipFrames - 跳过的栈帧数
     * @returns {string} 调用栈字符串
     */
    function getStackTrace(skipFrames = 3) {
        try {
            const stack = new Error().stack;
            if (stack) {
                const lines = stack.split('\n');
                return lines.slice(skipFrames).join('\n');
            }
        } catch (error) {
            // 忽略获取堆栈失败的错误
        }
        return 'Stack trace not available';
    }

    /**
     * 获取内存使用情况
     * @returns {object} 内存使用信息
     */
    function getMemoryInfo() {
        if (performance.memory) {
            return {
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                timestamp: Date.now()
            };
        }
        return null;
    }

    /**
     * 创建日志条目
     * @param {string} level - 日志级别
     * @param {string} message - 日志消息
     * @param {*} data - 附加数据
     * @param {object} options - 选项
     * @returns {object} 日志条目对象
     */
    function createLogEntry(level, message, data, options = {}) {
        const entry = {
            id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: formatTimestamp(),
            level: level.toUpperCase(),
            message: message,
            data: data,
            url: window.location.href,
            userAgent: navigator.userAgent,
            ...options
        };

        // 添加调用栈信息（仅对错误级别）
        if (level === 'error' || getConfig('DEBUG.VERBOSE_LOGGING', false)) {
            entry.stack = getStackTrace();
        }

        // 添加内存信息
        if (getConfig('PERFORMANCE.ENABLE_MEMORY_TRACKING', false)) {
            entry.memory = getMemoryInfo();
        }

        return entry;
    }

    /**
     * 存储日志条目
     * @param {object} entry - 日志条目
     */
    function storeLogEntry(entry) {
        logEntries.push(entry);

        // 限制日志条目数量
        const maxEntries = getConfig('PERFORMANCE.MAX_LOG_ENTRIES', 1000);
        if (logEntries.length > maxEntries) {
            logEntries = logEntries.slice(-maxEntries);
        }

        // 分发日志事件
        window.dispatchEvent(new CustomEvent('refextractor:log', {
            detail: entry
        }));
    }

    /**
     * 输出到控制台
     * @param {object} entry - 日志条目
     */
    function outputToConsole(entry) {
        if (!getConfig('DEBUG.CONSOLE_OUTPUT', true)) {
            return;
        }

        const consoleMethod = {
            'ERROR': 'error',
            'WARN': 'warn',
            'INFO': 'info',
            'DEBUG': 'log'
        }[entry.level] || 'log';

        const prefix = `[${entry.timestamp}] [${entry.level}]`;
        
        if (entry.data) {
            console[consoleMethod](prefix, entry.message, entry.data);
        } else {
            console[consoleMethod](prefix, entry.message);
        }
    }

    /**
     * 检查日志级别是否应该记录
     * @param {string} level - 日志级别
     * @returns {boolean} 是否应该记录
     */
    function shouldLog(level) {
        const levels = getConfig('LOG_LEVELS', {
            ERROR: 0, WARN: 1, INFO: 2, DEBUG: 3
        });
        
        const currentLevel = getConfig('DEBUG.ENABLED', true) ? 
            (getConfig('DEBUG.VERBOSE_LOGGING', false) ? levels.DEBUG : levels.INFO) : 
            levels.ERROR;
        
        const messageLevel = levels[level.toUpperCase()] || levels.INFO;
        
        return messageLevel <= currentLevel;
    }

    // 公共API
    const Logger = {
        /**
         * 初始化日志系统
         * @param {object} options - 初始化选项
         */
        init(options = {}) {
            if (isInitialized) {
                return;
            }

            isInitialized = true;
            
            // 记录初始化日志
            this.info('RefExtractor Logger initialized', {
                config: getConfig('DEBUG', {}),
                performance: getConfig('PERFORMANCE', {}),
                memoryInfo: getMemoryInfo()
            });

            // 全局错误处理
            window.addEventListener('error', (event) => {
                this.error('Global Error', {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno,
                    error: event.error
                });
            });

            // 未处理的Promise拒绝
            window.addEventListener('unhandledrejection', (event) => {
                this.error('Unhandled Promise Rejection', {
                    reason: event.reason,
                    promise: event.promise
                });
            });
        },

        /**
         * 记录错误级别日志
         * @param {string} message - 日志消息
         * @param {*} data - 附加数据
         * @param {object} options - 选项
         */
        error(message, data = null, options = {}) {
            if (!shouldLog('error')) return;
            
            const entry = createLogEntry('error', message, data, options);
            storeLogEntry(entry);
            outputToConsole(entry);
        },

        /**
         * 记录警告级别日志
         * @param {string} message - 日志消息
         * @param {*} data - 附加数据
         * @param {object} options - 选项
         */
        warn(message, data = null, options = {}) {
            if (!shouldLog('warn')) return;
            
            const entry = createLogEntry('warn', message, data, options);
            storeLogEntry(entry);
            outputToConsole(entry);
        },

        /**
         * 记录信息级别日志
         * @param {string} message - 日志消息
         * @param {*} data - 附加数据
         * @param {object} options - 选项
         */
        info(message, data = null, options = {}) {
            if (!shouldLog('info')) return;
            
            const entry = createLogEntry('info', message, data, options);
            storeLogEntry(entry);
            outputToConsole(entry);
        },

        /**
         * 记录调试级别日志
         * @param {string} message - 日志消息
         * @param {*} data - 附加数据
         * @param {object} options - 选项
         */
        debug(message, data = null, options = {}) {
            if (!shouldLog('debug')) return;
            
            const entry = createLogEntry('debug', message, data, options);
            storeLogEntry(entry);
            outputToConsole(entry);
        },

        /**
         * 开始性能计时
         * @param {string} markName - 标记名称
         * @param {string} description - 描述
         */
        startTiming(markName, description = '') {
            if (!getConfig('PERFORMANCE.ENABLE_TIMING', true)) {
                return;
            }

            const startTime = performance.now();
            performanceMarks.set(markName, {
                startTime,
                description,
                timestamp: Date.now()
            });

            this.debug(`Performance timing started: ${markName}`, {
                description,
                startTime
            });
        },

        /**
         * 结束性能计时
         * @param {string} markName - 标记名称
         * @returns {number} 持续时间（毫秒）
         */
        endTiming(markName) {
            if (!getConfig('PERFORMANCE.ENABLE_TIMING', true)) {
                return 0;
            }

            const mark = performanceMarks.get(markName);
            if (!mark) {
                this.warn(`Performance mark not found: ${markName}`);
                return 0;
            }

            const endTime = performance.now();
            const duration = endTime - mark.startTime;

            this.info(`Performance timing completed: ${markName}`, {
                description: mark.description,
                duration: `${duration.toFixed(2)}ms`,
                startTime: mark.startTime,
                endTime
            });

            performanceMarks.delete(markName);
            return duration;
        },

        /**
         * 记录内存快照
         * @param {string} label - 快照标签
         */
        takeMemorySnapshot(label) {
            if (!getConfig('PERFORMANCE.ENABLE_MEMORY_TRACKING', false)) {
                return;
            }

            const memoryInfo = getMemoryInfo();
            if (memoryInfo) {
                memorySnapshots.push({
                    label,
                    ...memoryInfo
                });

                this.debug(`Memory snapshot taken: ${label}`, memoryInfo);
            }
        },

        /**
         * 获取所有日志条目
         * @param {string} level - 可选的日志级别过滤
         * @returns {array} 日志条目数组
         */
        getLogs(level = null) {
            if (level) {
                return logEntries.filter(entry => 
                    entry.level === level.toUpperCase()
                );
            }
            return [...logEntries];
        },

        /**
         * 获取性能统计信息
         * @returns {object} 性能统计
         */
        getPerformanceStats() {
            return {
                activeMarks: Array.from(performanceMarks.keys()),
                memorySnapshots: [...memorySnapshots],
                logCount: logEntries.length,
                lastLogTime: logEntries.length > 0 ? 
                    logEntries[logEntries.length - 1].timestamp : null
            };
        },

        /**
         * 清除日志
         * @param {string} level - 可选的日志级别过滤
         */
        clearLogs(level = null) {
            if (level) {
                logEntries = logEntries.filter(entry => 
                    entry.level !== level.toUpperCase()
                );
            } else {
                logEntries = [];
            }
            
            this.info('Logs cleared', { level });
        },

        /**
         * 导出日志数据
         * @param {object} options - 导出选项
         * @returns {string} JSON格式的日志数据
         */
        exportLogs(options = {}) {
            const exportData = {
                metadata: {
                    exportTime: formatTimestamp(),
                    version: getConfig('APP.VERSION', '1.0.0'),
                    url: window.location.href,
                    userAgent: navigator.userAgent
                },
                logs: this.getLogs(options.level),
                performance: options.includePerformance ? 
                    this.getPerformanceStats() : null
            };

            return JSON.stringify(exportData, null, 2);
        },

        /**
         * 设置日志级别
         * @param {string} level - 日志级别
         */
        setLevel(level) {
            // 这里可以动态更新配置
            if (window.RefExtractorConfig) {
                // 在实际实现中，需要提供配置更新机制
                this.info(`Log level changed to: ${level}`);
            }
        }
    };

    return Logger;
})();

// 自动初始化
if (typeof window !== 'undefined') {
    window.addEventListener('DOMContentLoaded', function() {
        window.RefExtractorLogger.init();
    });
}

// 导出模块（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorLogger;
}
