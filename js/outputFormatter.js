/**
 * @fileoverview 输出格式化模块 - 处理不同格式的输出转换（JSON、BibTeX、RIS等）
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor输出格式化器
 * 负责将引用数据转换为不同的输出格式
 */
window.RefExtractorOutputFormatter = (function() {
    'use strict';

    // 私有变量
    let currentCitations = [];
    let formattingCache = new Map();
    let formattingStats = {
        totalFormattings: 0,
        successfulFormattings: 0,
        cachedResults: 0,
        formatCounts: {}
    };

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
            debug: console.log.bind(console),
            startTiming: () => {},
            endTiming: () => 0
        };
    }

    /**
     * 获取错误处理器实例
     * @returns {object} 错误处理器对象
     */
    function getErrorHandler() {
        return window.RefExtractorErrorHandler || {
            handleError: (code, message, error, context) => {
                console.error(`Error ${code}: ${message}`, error, context);
                return { code, message, error, context };
            }
        };
    }

    /**
     * 检查Citation.js是否可用
     * @returns {boolean} 是否可用
     */
    function isCitationJsAvailable() {
        return typeof Cite !== 'undefined' && typeof Cite === 'function';
    }

    /**
     * 生成缓存键
     * @param {array} citations - 引用数组
     * @param {string} format - 格式名称
     * @param {object} options - 格式选项
     * @returns {string} 缓存键
     */
    function generateCacheKey(citations, format, options = {}) {
        const citationsHash = JSON.stringify(citations).slice(0, 100);
        const optionsHash = JSON.stringify(options);
        return `${format}_${citationsHash}_${optionsHash}`;
    }

    /**
     * 清理引用数据（移除引用计数）
     * @param {array} citations - 引用数组
     * @returns {array} 清理后的引用数组
     */
    function cleanCitations(citations) {
        const logger = getLogger();
        logger.debug('Cleaning citations (removing cite counts)');

        if (!Array.isArray(citations)) {
            return [];
        }

        return citations.map(citation => {
            if (!citation || typeof citation !== 'object') {
                return citation;
            }

            const cleanedCitation = { ...citation };

            // 移除引用计数信息
            if (cleanedCitation.note && typeof cleanedCitation.note === 'string') {
                cleanedCitation.note = cleanedCitation.note.replace(/Times cited: \d+\n/g, '');
                
                // 如果note为空，则删除该字段
                if (cleanedCitation.note.trim() === '') {
                    delete cleanedCitation.note;
                }
            }

            return cleanedCitation;
        });
    }

    /**
     * 为引用添加计数到标题
     * @param {array} citations - 引用数组
     * @returns {array} 添加计数后的引用数组
     */
    function addCountsToTitle(citations) {
        const logger = getLogger();
        logger.debug('Adding cite counts to titles');

        if (!Array.isArray(citations)) {
            return [];
        }

        return citations.map(citation => {
            if (!citation || typeof citation !== 'object') {
                return citation;
            }

            const modifiedCitation = { ...citation };

            // 提取引用计数
            let count = 'NA';
            if (modifiedCitation.note && typeof modifiedCitation.note === 'string') {
                const match = modifiedCitation.note.match(/Times cited: (\d+)/);
                if (match) {
                    count = match[1];
                }
            }

            // 修改标题
            if (modifiedCitation.title) {
                modifiedCitation.title = `[${count} citations] ${modifiedCitation.title}`;
            }

            return modifiedCitation;
        });
    }

    /**
     * 处理带计数的参考文献格式
     * @param {array} citations - 引用数组
     * @returns {string} 格式化的输出
     */
    function formatBibliographyWithCounts(citations) {
        const logger = getLogger();
        logger.debug('Formatting bibliography with counts');

        try {
            // 添加计数到标题
            const modifiedCitations = addCountsToTitle(citations);
            const citationJson = JSON.stringify(modifiedCitations);

            // 使用Citation.js格式化为APA
            const citationRender = new Cite(citationJson);
            const bibliography = citationRender.format('bibliography');

            // 解析并重新格式化为表格格式
            const lines = bibliography.split('\n');
            const formattedLines = lines.map(line => {
                if (!line.trim()) {
                    return null;
                }

                const countMatch = line.match(/\[(\d+) citations\] /);
                if (countMatch) {
                    const count = countMatch[1];
                    const cleanedLine = line.replace(countMatch[0], '');
                    return [parseInt(count, 10), `${count}\t${cleanedLine}`];
                }
                
                return [0, `0\t${line}`];
            }).filter(item => item !== null);

            // 按引用次数排序
            formattedLines.sort((a, b) => b[0] - a[0]);

            // 生成最终输出
            const header = 'cite_count\treference\n';
            const body = formattedLines
                .map(item => item[1])
                .filter(line => !line.startsWith('0\t'))
                .join('\n');

            return header + body;

        } catch (error) {
            logger.error('Error formatting bibliography with counts', error);
            throw error;
        }
    }

    /**
     * 使用Citation.js进行格式化
     * @param {array} citations - 引用数组
     * @param {string} format - 目标格式
     * @param {object} options - 格式选项
     * @returns {string} 格式化的输出
     */
    function formatWithCitationJs(citations, format, options = {}) {
        const logger = getLogger();
        const errorHandler = getErrorHandler();

        logger.debug('Formatting with Citation.js', { format, citationCount: citations.length });

        try {
            if (!isCitationJsAvailable()) {
                throw new Error('Citation.js is not available');
            }

            if (!Array.isArray(citations) || citations.length === 0) {
                logger.info('No citations to format');
                return '';
            }

            // 根据格式选择处理方式
            let processedCitations = citations;
            
            if (format === getConfig('OUTPUT_FORMATS.BIBLIOGRAPHY_WITH_COUNTS')) {
                return formatBibliographyWithCounts(citations);
            } else if (format !== getConfig('OUTPUT_FORMATS.CSL_JSON_WITH_COUNTS')) {
                // 对于非计数格式，清理引用数据
                processedCitations = cleanCitations(citations);
            }

            // 转换为JSON字符串
            const citationJson = JSON.stringify(processedCitations);
            
            // 创建Citation.js实例
            const citationRender = new Cite(citationJson);
            
            // 格式化输出
            const result = citationRender.format(format, options);
            
            logger.debug('Citation.js formatting completed', {
                format,
                inputCount: citations.length,
                outputLength: typeof result === 'string' ? result.length : 0
            });

            return result;

        } catch (error) {
            const handledError = errorHandler.handleError(
                getConfig('ERROR_CODES.CITATION_JS_ERROR', 5001),
                'Citation.js formatting failed',
                error,
                { format, citationCount: citations.length }
            );
            
            throw handledError;
        }
    }

    /**
     * 备用格式化方法（当Citation.js不可用时）
     * @param {array} citations - 引用数组
     * @param {string} format - 目标格式
     * @returns {string} 格式化的输出
     */
    function formatFallback(citations, format) {
        const logger = getLogger();
        logger.warn('Using fallback formatting method', { format });

        if (!Array.isArray(citations) || citations.length === 0) {
            return '';
        }

        switch (format) {
            case getConfig('OUTPUT_FORMATS.CSL_JSON'):
            case getConfig('OUTPUT_FORMATS.CSL_JSON_WITH_COUNTS'):
                const processedCitations = format === getConfig('OUTPUT_FORMATS.CSL_JSON') 
                    ? cleanCitations(citations) 
                    : citations;
                return JSON.stringify(processedCitations, null, 2);

            case getConfig('OUTPUT_FORMATS.BIBLIOGRAPHY'):
                return citations.map((citation, index) => {
                    const title = citation.title || 'Unknown Title';
                    const author = citation.author ? 
                        citation.author.map(a => `${a.family}, ${a.given}`).join(', ') : 
                        'Unknown Author';
                    return `${index + 1}. ${author}. ${title}.`;
                }).join('\n');

            default:
                logger.error('Unsupported format for fallback formatting', { format });
                return JSON.stringify(citations, null, 2);
        }
    }

    /**
     * 获取文件扩展名
     * @param {string} format - 格式名称
     * @returns {string} 文件扩展名
     */
    function getFileExtension(format) {
        const extensions = getConfig('FILE_EXTENSIONS', {});
        return extensions[format] || '.txt';
    }

    /**
     * 更新格式化统计信息
     * @param {string} format - 格式名称
     * @param {boolean} success - 是否成功
     * @param {boolean} fromCache - 是否来自缓存
     */
    function updateFormattingStats(format, success, fromCache = false) {
        formattingStats.totalFormattings++;
        
        if (success) {
            formattingStats.successfulFormattings++;
        }
        
        if (fromCache) {
            formattingStats.cachedResults++;
        }

        if (!formattingStats.formatCounts[format]) {
            formattingStats.formatCounts[format] = 0;
        }
        formattingStats.formatCounts[format]++;
    }

    // 公共API
    const OutputFormatter = {
        /**
         * 设置当前引用数据
         * @param {array} citations - 引用数组
         */
        setCitations(citations) {
            const logger = getLogger();
            
            if (!Array.isArray(citations)) {
                logger.warn('Citations must be an array');
                currentCitations = [];
                return;
            }

            currentCitations = [...citations];
            logger.debug('Citations set for formatting', { count: currentCitations.length });
        },

        /**
         * 格式化输出
         * @param {string} format - 目标格式
         * @param {array} citations - 可选的引用数组（如果不提供则使用当前设置的引用）
         * @param {object} options - 格式选项
         * @returns {string} 格式化的输出
         */
        format(format, citations = null, options = {}) {
            const logger = getLogger();
            logger.startTiming('format_output');

            const citationsToFormat = citations || currentCitations;
            
            logger.info('Starting output formatting', {
                format,
                citationCount: citationsToFormat.length,
                useProvidedCitations: !!citations
            });

            try {
                // 检查缓存
                const cacheKey = generateCacheKey(citationsToFormat, format, options);
                if (formattingCache.has(cacheKey)) {
                    const cachedResult = formattingCache.get(cacheKey);
                    logger.debug('Using cached formatting result');
                    updateFormattingStats(format, true, true);
                    logger.endTiming('format_output');
                    return cachedResult;
                }

                // 验证输入
                if (!format || typeof format !== 'string') {
                    throw new Error('Format must be a non-empty string');
                }

                if (!Array.isArray(citationsToFormat)) {
                    throw new Error('Citations must be an array');
                }

                if (citationsToFormat.length === 0) {
                    logger.info('No citations to format');
                    const emptyResult = '';
                    updateFormattingStats(format, true);
                    logger.endTiming('format_output');
                    return emptyResult;
                }

                let result;

                // 尝试使用Citation.js格式化
                try {
                    result = formatWithCitationJs(citationsToFormat, format, options);
                } catch (citationJsError) {
                    logger.warn('Citation.js formatting failed, using fallback', citationJsError);
                    result = formatFallback(citationsToFormat, format);
                }

                // 缓存结果
                formattingCache.set(cacheKey, result);

                // 限制缓存大小
                if (formattingCache.size > 100) {
                    const firstKey = formattingCache.keys().next().value;
                    formattingCache.delete(firstKey);
                }

                updateFormattingStats(format, true);
                
                const processingTime = logger.endTiming('format_output');
                logger.info('Output formatting completed', {
                    format,
                    citationCount: citationsToFormat.length,
                    outputLength: result.length,
                    processingTime: `${processingTime.toFixed(2)}ms`
                });

                return result;

            } catch (error) {
                logger.endTiming('format_output');
                updateFormattingStats(format, false);
                
                logger.error('Output formatting failed', {
                    format,
                    citationCount: citationsToFormat.length,
                    error: error.message
                });

                throw error;
            }
        },

        /**
         * 获取当前引用数据
         * @returns {array} 当前引用数组
         */
        getCurrentCitations() {
            return [...currentCitations];
        },

        /**
         * 获取支持的输出格式
         * @returns {object} 支持的格式信息
         */
        getSupportedFormats() {
            const formats = getConfig('OUTPUT_FORMATS', {});
            const extensions = getConfig('FILE_EXTENSIONS', {});

            const supportedFormats = {};
            
            for (const [key, format] of Object.entries(formats)) {
                supportedFormats[format] = {
                    key: key,
                    format: format,
                    extension: extensions[format] || '.txt',
                    description: this.getFormatDescription(format),
                    requiresCitationJs: this.requiresCitationJs(format)
                };
            }

            return supportedFormats;
        },

        /**
         * 获取格式描述
         * @param {string} format - 格式名称
         * @returns {string} 格式描述
         */
        getFormatDescription(format) {
            const descriptions = {
                [getConfig('OUTPUT_FORMATS.CSL_JSON')]: 'CSL JSON format for reference managers',
                [getConfig('OUTPUT_FORMATS.CSL_JSON_WITH_COUNTS')]: 'CSL JSON with citation counts in notes',
                [getConfig('OUTPUT_FORMATS.BIBTEX')]: 'BibTeX format for LaTeX',
                [getConfig('OUTPUT_FORMATS.RIS')]: 'RIS format for reference managers',
                [getConfig('OUTPUT_FORMATS.BIBLIOGRAPHY')]: 'Formatted APA bibliography',
                [getConfig('OUTPUT_FORMATS.BIBLIOGRAPHY_WITH_COUNTS')]: 'APA bibliography with citation counts (tab-separated)'
            };

            return descriptions[format] || 'Unknown format';
        },

        /**
         * 检查格式是否需要Citation.js
         * @param {string} format - 格式名称
         * @returns {boolean} 是否需要Citation.js
         */
        requiresCitationJs(format) {
            const citationJsFormats = [
                getConfig('OUTPUT_FORMATS.BIBTEX'),
                getConfig('OUTPUT_FORMATS.RIS'),
                getConfig('OUTPUT_FORMATS.BIBLIOGRAPHY'),
                getConfig('OUTPUT_FORMATS.BIBLIOGRAPHY_WITH_COUNTS')
            ];

            return citationJsFormats.includes(format);
        },

        /**
         * 获取文件扩展名
         * @param {string} format - 格式名称
         * @returns {string} 文件扩展名
         */
        getFileExtension(format) {
            return getFileExtension(format);
        },

        /**
         * 清除格式化缓存
         */
        clearCache() {
            const logger = getLogger();
            formattingCache.clear();
            logger.debug('Formatting cache cleared');
        },

        /**
         * 获取格式化统计信息
         * @returns {object} 统计信息
         */
        getFormattingStats() {
            return {
                ...formattingStats,
                cacheSize: formattingCache.size,
                successRate: formattingStats.totalFormattings > 0 ? 
                    (formattingStats.successfulFormattings / formattingStats.totalFormattings * 100).toFixed(2) + '%' : 
                    'N/A'
            };
        },

        /**
         * 重置统计信息
         */
        resetStats() {
            const logger = getLogger();
            formattingStats = {
                totalFormattings: 0,
                successfulFormattings: 0,
                cachedResults: 0,
                formatCounts: {}
            };
            logger.debug('Formatting statistics reset');
        },

        /**
         * 验证Citation.js可用性
         * @returns {object} 验证结果
         */
        validateCitationJs() {
            const isAvailable = isCitationJsAvailable();
            const version = isAvailable && typeof Cite.version === 'string' ? Cite.version : 'unknown';
            
            return {
                isAvailable,
                version,
                supportedFormats: isAvailable ? ['bibtex', 'ris', 'bibliography'] : [],
                error: isAvailable ? null : 'Citation.js is not loaded or available'
            };
        }
    };

    return OutputFormatter;
})();

// 导出模块（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorOutputFormatter;
}
