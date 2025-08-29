/**
 * @fileoverview 引用处理模块 - 处理引用数据的解析、去重、计数和元数据提取
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor引用处理器
 * 负责CSL引用的解析、去重、计数统计和元数据提取
 */
window.RefExtractorCitationProcessor = (function() {
    'use strict';

    // 私有变量
    let processedCitations = [];
    let processingStats = {
        totalFields: 0,
        validCitations: 0,
        duplicatesRemoved: 0,
        citesWithoutMetadata: 0,
        processingTime: 0
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
     * 解析单个引用字段
     * @param {string} field - 引用字段内容
     * @param {number} fieldIndex - 字段索引
     * @returns {array} 解析出的引用对象数组
     */
    function parseField(field, fieldIndex) {
        const logger = getLogger();
        const citations = [];

        try {
            // 检查是否为CSL引用字段
            const cslFieldPrefix = getConfig('CITATION_PREFIXES.CSL_GENERAL');
            if (!cslFieldPrefix.test(field)) {
                logger.debug(`Field ${fieldIndex + 1} is not a CSL citation field`);
                return citations;
            }

            // 移除字段前缀
            let cleanedField = field.replace(cslFieldPrefix, '').trim();
            
            // 如果JSON后面有哈希值，只保留JSON部分
            cleanedField = cleanedField.replace(/(\{.+\}) [0-9A-Za-z]+$/, '$1');

            if (!cleanedField || cleanedField.length === 0) {
                logger.debug(`Field ${fieldIndex + 1} has no content after cleaning`);
                return citations;
            }

            // 解析JSON内容
            const fieldObject = JSON.parse(cleanedField);
            
            // 验证字段对象结构
            if (!fieldObject || typeof fieldObject !== 'object') {
                throw new Error('Invalid field object structure');
            }

            if (!fieldObject.hasOwnProperty('citationItems') || !Array.isArray(fieldObject.citationItems)) {
                logger.debug(`Field ${fieldIndex + 1} has no citationItems array`);
                return citations;
            }

            // 提取引用项
            fieldObject.citationItems.forEach((cite, citeIndex) => {
                try {
                    if (cite && typeof cite === 'object') {
                        citations.push({
                            ...cite,
                            _fieldIndex: fieldIndex,
                            _citeIndex: citeIndex,
                            _originalField: field
                        });
                    }
                } catch (citeError) {
                    logger.warn(`Failed to process citation ${citeIndex + 1} in field ${fieldIndex + 1}`, citeError);
                }
            });

            logger.debug(`Parsed ${citations.length} citations from field ${fieldIndex + 1}`);
            return citations;

        } catch (error) {
            logger.warn(`Failed to parse field ${fieldIndex + 1}`, {
                error: error.message,
                fieldLength: field.length,
                fieldPreview: field.substring(0, 100)
            });
            return citations;
        }
    }

    /**
     * 解析所有引用字段
     * @param {array} fields - 字段数组
     * @returns {array} 解析出的所有引用对象
     */
    function parseFields(fields) {
        const logger = getLogger();
        logger.startTiming('parse_fields');
        logger.info('Starting citation parsing', { fieldCount: fields.length });

        const allCitations = [];

        fields.forEach((field, index) => {
            try {
                const citations = parseField(field, index);
                allCitations.push(...citations);
            } catch (fieldError) {
                logger.warn(`Error processing field ${index + 1}`, fieldError);
            }
        });

        logger.endTiming('parse_fields');
        logger.info('Citation parsing completed', {
            totalFields: fields.length,
            totalCitations: allCitations.length
        });

        return allCitations;
    }

    /**
     * 去重引用数据
     * @param {array} citations - 引用对象数组
     * @returns {array} 去重后的引用数组
     */
    function deduplicateCitations(citations) {
        const logger = getLogger();
        logger.startTiming('deduplicate_citations');
        logger.info('Starting citation deduplication', { citationCount: citations.length });

        if (!Array.isArray(citations) || citations.length === 0) {
            logger.info('No citations to deduplicate');
            return [];
        }

        try {
            // 创建去重数组，包含项目、URI和计数信息
            const deduplicationArray = citations.map((cite, index) => ({
                item: cite.hasOwnProperty('itemData') ? cite.itemData : null,
                uris: cite.hasOwnProperty('uris') ? [...cite.uris] : [],
                count: 1,
                index: index,
                originalCite: cite
            }));

            // 第一步：规范化URI
            normalizeUris(deduplicationArray);

            // 第二步：去重并计数
            const deduplicatedArray = performDeduplication(deduplicationArray);

            // 第三步：转换回标准格式
            const result = deduplicatedArray
                .filter(entry => entry.item !== null)
                .map(entry => ({
                    itemData: entry.item,
                    uris: entry.uris,
                    _count: entry.count,
                    _indices: entry.indices || [entry.index]
                }));

            const duplicateCount = citations.length - result.length;
            
            logger.endTiming('deduplicate_citations');
            logger.info('Citation deduplication completed', {
                originalCount: citations.length,
                deduplicatedCount: result.length,
                duplicatesRemoved: duplicateCount
            });

            return result;

        } catch (error) {
            logger.endTiming('deduplicate_citations');
            
            const errorHandler = getErrorHandler();
            const handledError = errorHandler.handleError(
                getConfig('ERROR_CODES.DEDUPLICATION_ERROR', 3003),
                'Citation deduplication failed',
                error,
                { citationCount: citations.length }
            );
            
            throw handledError;
        }
    }

    /**
     * 规范化URI数组
     * @param {array} deduplicationArray - 去重数组
     */
    function normalizeUris(deduplicationArray) {
        const logger = getLogger();
        logger.debug('Normalizing URIs');

        // 第一遍：为每个引用添加所有匹配项的URI
        for (let i = 0; i < deduplicationArray.length; i++) {
            const currentItem = deduplicationArray[i];
            
            for (let j = 0; j < currentItem.uris.length; j++) {
                const uri = currentItem.uris[j];
                
                // 找到所有包含相同URI的引用
                const matchingItems = deduplicationArray.filter(item => 
                    item.uris.indexOf(uri) !== -1
                );

                // 将所有匹配项的URI添加到当前项
                matchingItems.forEach(matchingItem => {
                    const newUris = matchingItem.uris.filter(matchUri => 
                        currentItem.uris.indexOf(matchUri) === -1
                    );
                    currentItem.uris.push(...newUris);
                });
            }
        }

        logger.debug('URI normalization completed');
    }

    /**
     * 执行去重操作
     * @param {array} deduplicationArray - 去重数组
     * @returns {array} 去重后的数组
     */
    function performDeduplication(deduplicationArray) {
        const logger = getLogger();
        logger.debug('Performing deduplication');

        const duplicateIndices = new Set();
        
        for (let i = 0; i < deduplicationArray.length; i++) {
            const currentItem = deduplicationArray[i];
            
            if (duplicateIndices.has(currentItem.index)) {
                continue; // 已标记为重复，跳过
            }

            if (currentItem.uris.length === 0) {
                continue; // 无URI，无法匹配
            }

            // 使用第一个URI查找匹配项
            const uri = currentItem.uris[0];
            const matchingItems = deduplicationArray.filter(item => 
                item.uris.indexOf(uri) !== -1 && !duplicateIndices.has(item.index)
            );

            // 统计引用次数
            currentItem.count = matchingItems.length;
            currentItem.indices = matchingItems.map(item => item.index);

            // 添加引用计数到元数据
            if (currentItem.item) {
                addCiteCountToItem(currentItem.item, currentItem.count);
            }

            // 标记重复项
            matchingItems.forEach(matchingItem => {
                if (matchingItem.index > currentItem.index) {
                    duplicateIndices.add(matchingItem.index);
                }
            });
        }

        // 移除重复项
        const deduplicatedArray = deduplicationArray.filter(item => 
            !duplicateIndices.has(item.index)
        );

        logger.debug('Deduplication completed', {
            originalCount: deduplicationArray.length,
            duplicatesRemoved: duplicateIndices.size,
            remainingCount: deduplicatedArray.length
        });

        return deduplicatedArray;
    }

    /**
     * 向项目元数据添加引用计数
     * @param {object} item - 项目对象
     * @param {number} count - 引用次数
     */
    function addCiteCountToItem(item, count) {
        if (!item || typeof item !== 'object') {
            return;
        }

        // 确保note字段存在
        if (!item.hasOwnProperty('note')) {
            item.note = '';
        }

        // 添加引用计数信息
        const countInfo = `Times cited: ${count}`;
        item.note = item.note ? `${countInfo}\n${item.note}` : countInfo;
    }

    /**
     * 提取元数据（仅保留有元数据的项目）
     * @param {array} deduplicatedCitations - 去重后的引用数组
     * @returns {array} 包含元数据的项目数组
     */
    function extractMetadata(deduplicatedCitations) {
        const logger = getLogger();
        logger.startTiming('extract_metadata');
        logger.info('Extracting metadata', { citationCount: deduplicatedCitations.length });

        const metadataItems = [];

        deduplicatedCitations.forEach((citation, index) => {
            try {
                if (citation.hasOwnProperty('itemData') && citation.itemData) {
                    // 验证元数据完整性
                    if (isValidMetadata(citation.itemData)) {
                        metadataItems.push(citation.itemData);
                    } else {
                        logger.warn(`Citation ${index + 1} has incomplete metadata`);
                    }
                } else {
                    logger.debug(`Citation ${index + 1} has no itemData`);
                }
            } catch (error) {
                logger.warn(`Error extracting metadata from citation ${index + 1}`, error);
            }
        });

        logger.endTiming('extract_metadata');
        logger.info('Metadata extraction completed', {
            totalCitations: deduplicatedCitations.length,
            itemsWithMetadata: metadataItems.length,
            itemsWithoutMetadata: deduplicatedCitations.length - metadataItems.length
        });

        return metadataItems;
    }

    /**
     * 验证元数据是否有效
     * @param {object} metadata - 元数据对象
     * @returns {boolean} 是否有效
     */
    function isValidMetadata(metadata) {
        if (!metadata || typeof metadata !== 'object') {
            return false;
        }

        // 检查必需字段
        const requiredFields = ['title'];
        const hasRequiredFields = requiredFields.some(field => 
            metadata.hasOwnProperty(field) && 
            metadata[field] && 
            metadata[field].toString().trim().length > 0
        );

        return hasRequiredFields;
    }

    /**
     * 更新处理统计信息
     * @param {object} stats - 统计信息
     */
    function updateProcessingStats(stats) {
        processingStats = {
            ...processingStats,
            ...stats,
            lastProcessed: new Date().toISOString()
        };
    }

    // 公共API
    const CitationProcessor = {
        /**
         * 处理引用字段
         * @param {array} fields - 字段数组
         * @returns {object} 处理结果
         */
        processFields(fields) {
            const logger = getLogger();
            const errorHandler = getErrorHandler();

            logger.startTiming('process_citations');
            logger.info('Starting citation processing', { fieldCount: fields.length });

            try {
                // 重置统计信息
                updateProcessingStats({
                    totalFields: fields.length,
                    validCitations: 0,
                    duplicatesRemoved: 0,
                    citesWithoutMetadata: 0,
                    processingTime: 0
                });

                // Step 1: 解析字段
                const parsedCitations = parseFields(fields);
                updateProcessingStats({ validCitations: parsedCitations.length });

                if (parsedCitations.length === 0) {
                    logger.warn('No valid citations found in fields');
                    return {
                        citations: [],
                        statistics: { ...processingStats },
                        isEmpty: true
                    };
                }

                // Step 2: 去重
                const deduplicatedCitations = deduplicateCitations(parsedCitations);
                const duplicatesRemoved = parsedCitations.length - deduplicatedCitations.length;
                updateProcessingStats({ duplicatesRemoved });

                // Step 3: 提取元数据
                const metadataItems = extractMetadata(deduplicatedCitations);
                const citesWithoutMetadata = deduplicatedCitations.length - metadataItems.length;
                updateProcessingStats({ citesWithoutMetadata });

                // 保存处理结果
                processedCitations = metadataItems;

                const processingTime = logger.endTiming('process_citations');
                updateProcessingStats({ processingTime });

                const result = {
                    citations: metadataItems,
                    statistics: {
                        ...processingStats,
                        success: true
                    },
                    isEmpty: metadataItems.length === 0,
                    rawCitations: parsedCitations,
                    deduplicatedCitations: deduplicatedCitations
                };

                logger.info('Citation processing completed successfully', {
                    totalFields: fields.length,
                    validCitations: parsedCitations.length,
                    deduplicatedCitations: deduplicatedCitations.length,
                    finalCitations: metadataItems.length,
                    duplicatesRemoved,
                    citesWithoutMetadata,
                    processingTime: `${processingTime.toFixed(2)}ms`
                });

                return result;

            } catch (error) {
                logger.endTiming('process_citations');
                
                const handledError = errorHandler.handleError(
                    getConfig('ERROR_CODES.CITATION_PARSE_ERROR', 3001),
                    'Citation processing failed',
                    error,
                    { fieldCount: fields.length }
                );

                updateProcessingStats({
                    processingTime: 0,
                    success: false,
                    error: handledError.message
                });

                throw handledError;
            }
        },

        /**
         * 获取当前处理的引用
         * @returns {array} 当前引用数组
         */
        getProcessedCitations() {
            return [...processedCitations];
        },

        /**
         * 获取处理统计信息
         * @returns {object} 统计信息
         */
        getProcessingStats() {
            return { ...processingStats };
        },

        /**
         * 清除处理结果
         */
        clearProcessedCitations() {
            const logger = getLogger();
            logger.debug('Clearing processed citations');
            
            processedCitations = [];
            processingStats = {
                totalFields: 0,
                validCitations: 0,
                duplicatesRemoved: 0,
                citesWithoutMetadata: 0,
                processingTime: 0
            };
        },

        /**
         * 验证引用数据
         * @param {array} citations - 引用数组
         * @returns {object} 验证结果
         */
        validateCitations(citations) {
            const logger = getLogger();
            
            if (!Array.isArray(citations)) {
                return {
                    isValid: false,
                    errors: ['Citations must be an array'],
                    validCitations: [],
                    statistics: { total: 0, valid: 0, invalid: 0 }
                };
            }

            const validCitations = [];
            const errors = [];

            citations.forEach((citation, index) => {
                try {
                    if (isValidMetadata(citation)) {
                        validCitations.push(citation);
                    } else {
                        errors.push(`Citation ${index + 1} has invalid or incomplete metadata`);
                    }
                } catch (error) {
                    errors.push(`Citation ${index + 1} validation failed: ${error.message}`);
                }
            });

            const result = {
                isValid: errors.length === 0,
                errors,
                validCitations,
                statistics: {
                    total: citations.length,
                    valid: validCitations.length,
                    invalid: errors.length
                }
            };

            logger.debug('Citation validation completed', result.statistics);
            return result;
        },

        /**
         * 获取引用统计信息
         * @param {array} citations - 引用数组（可选，默认使用当前处理的引用）
         * @returns {object} 详细统计信息
         */
        getCitationStatistics(citations = null) {
            const citationsToAnalyze = citations || processedCitations;
            
            if (!Array.isArray(citationsToAnalyze) || citationsToAnalyze.length === 0) {
                return {
                    total: 0,
                    withCounts: 0,
                    withoutCounts: 0,
                    averageCitations: 0,
                    maxCitations: 0,
                    minCitations: 0,
                    citationCounts: []
                };
            }

            const citationCounts = [];
            let withCounts = 0;

            citationsToAnalyze.forEach(citation => {
                if (citation.note && citation.note.includes('Times cited:')) {
                    const match = citation.note.match(/Times cited: (\d+)/);
                    if (match) {
                        const count = parseInt(match[1], 10);
                        citationCounts.push(count);
                        withCounts++;
                    }
                }
            });

            const total = citationsToAnalyze.length;
            const withoutCounts = total - withCounts;
            const sum = citationCounts.reduce((acc, count) => acc + count, 0);
            const averageCitations = citationCounts.length > 0 ? sum / citationCounts.length : 0;
            const maxCitations = citationCounts.length > 0 ? Math.max(...citationCounts) : 0;
            const minCitations = citationCounts.length > 0 ? Math.min(...citationCounts) : 0;

            return {
                total,
                withCounts,
                withoutCounts,
                averageCitations: parseFloat(averageCitations.toFixed(2)),
                maxCitations,
                minCitations,
                citationCounts: [...citationCounts].sort((a, b) => b - a),
                totalCitations: sum
            };
        }
    };

    return CitationProcessor;
})();

// 导出模块（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorCitationProcessor;
}
