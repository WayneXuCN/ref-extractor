/**
 * @fileoverview Zotero集成模块 - 处理Zotero库选择和条目选择功能
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor Zotero集成器
 * 负责从引用中提取Zotero信息并生成库选择链接
 */
window.RefExtractorZoteroIntegration = (function() {
    'use strict';

    // 私有变量
    let zoteroLibrarySelectors = {};
    let zoteroItemKeys = [];
    let integrationStats = {
        totalItems: 0,
        zoteroItems: 0,
        librariesFound: 0,
        selectorsGenerated: 0
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
     * 检查URI是否为Zotero URI
     * @param {string} uri - URI字符串
     * @returns {boolean} 是否为Zotero URI
     */
    function isZoteroUri(uri) {
        if (!uri || typeof uri !== 'string') {
            return false;
        }

        const zoteroPrefix = getConfig('ZOTERO.URI_PREFIX', 'http://zotero.org/');
        return uri.includes(zoteroPrefix);
    }

    /**
     * 解析Zotero URI
     * @param {string} uri - Zotero URI
     * @returns {object|null} 解析结果
     */
    function parseZoteroUri(uri) {
        const logger = getLogger();

        try {
            if (!isZoteroUri(uri)) {
                return null;
            }

            // 规范化URI（将local用户转换为web用户）
            const localPrefix = getConfig('ZOTERO.LOCAL_URI_PREFIX', 'http://zotero.org/users/local/');
            const webPrefix = getConfig('ZOTERO.WEB_URI_PREFIX', 'http://zotero.org/users/');
            
            let normalizedUri = uri;
            if (uri.includes(localPrefix)) {
                normalizedUri = uri.replace(localPrefix, webPrefix);
            }

            // 分割URI组件
            const uriParts = normalizedUri.split('/');
            
            // 期望的URI格式：
            // http://zotero.org/users/{userID}/items/{itemKey}
            // http://zotero.org/groups/{groupID}/items/{itemKey}
            
            if (uriParts.length !== 7) {
                logger.warn('Invalid Zotero URI format', { uri, parts: uriParts.length });
                return null;
            }

            const [protocol, empty, domain, libraryType, libraryId, itemsKeyword, itemKey] = uriParts;

            // 验证URI结构
            if (protocol !== 'http:' || domain !== 'zotero.org' || itemsKeyword !== 'items') {
                logger.warn('Invalid Zotero URI structure', { uri, uriParts });
                return null;
            }

            // 验证库类型
            const validLibraryTypes = [
                getConfig('ZOTERO.LIBRARY_TYPES.USERS', 'users'),
                getConfig('ZOTERO.LIBRARY_TYPES.GROUPS', 'groups')
            ];

            if (!validLibraryTypes.includes(libraryType)) {
                logger.warn('Invalid Zotero library type', { uri, libraryType });
                return null;
            }

            const result = {
                originalUri: uri,
                normalizedUri: normalizedUri,
                libraryType: libraryType,
                libraryId: libraryId,
                itemKey: itemKey,
                libraryUrl: `https://www.zotero.org/${libraryType}/${libraryId}`
            };

            logger.debug('Successfully parsed Zotero URI', result);
            return result;

        } catch (error) {
            logger.warn('Error parsing Zotero URI', { uri, error: error.message });
            return null;
        }
    }

    /**
     * 从引用项目中提取Zotero条目
     * @param {array} citations - 引用数组
     * @returns {array} Zotero条目键数组
     */
    function extractZoteroItems(citations) {
        const logger = getLogger();
        logger.startTiming('extract_zotero_items');
        logger.info('Extracting Zotero items', { citationCount: citations.length });

        const extractedKeys = [];

        if (!Array.isArray(citations)) {
            logger.warn('Citations must be an array');
            return extractedKeys;
        }

        citations.forEach((citation, index) => {
            try {
                // 查找引用中的URIs
                if (citation.hasOwnProperty('uris') && Array.isArray(citation.uris)) {
                    citation.uris.forEach(uri => {
                        if (isZoteroUri(uri)) {
                            extractedKeys.push(uri);
                            logger.debug(`Found Zotero URI in citation ${index + 1}: ${uri}`);
                        }
                    });
                }
            } catch (error) {
                logger.warn(`Error extracting Zotero items from citation ${index + 1}`, error);
            }
        });

        logger.endTiming('extract_zotero_items');
        logger.info('Zotero item extraction completed', {
            totalCitations: citations.length,
            zoteroItems: extractedKeys.length
        });

        return extractedKeys;
    }

    /**
     * 按库分组Zotero条目
     * @param {array} zoteroKeys - Zotero条目键数组
     * @returns {object} 按库分组的条目
     */
    function groupItemsByLibrary(zoteroKeys) {
        const logger = getLogger();
        logger.debug('Grouping Zotero items by library', { itemCount: zoteroKeys.length });

        const libraries = {};

        zoteroKeys.forEach((uri, index) => {
            try {
                const parsedUri = parseZoteroUri(uri);
                
                if (!parsedUri) {
                    logger.warn(`Failed to parse Zotero URI ${index + 1}: ${uri}`);
                    return;
                }

                const libraryUrl = parsedUri.libraryUrl;

                // 初始化库条目如果不存在
                if (!libraries.hasOwnProperty(libraryUrl)) {
                    libraries[libraryUrl] = {
                        items: [],
                        type: parsedUri.libraryType,
                        subID: parsedUri.libraryId,
                        libraryUrl: libraryUrl
                    };
                }

                // 添加条目键（避免重复）
                if (!libraries[libraryUrl].items.includes(parsedUri.itemKey)) {
                    libraries[libraryUrl].items.push(parsedUri.itemKey);
                }

            } catch (error) {
                logger.warn(`Error grouping Zotero item ${index + 1}`, { uri, error: error.message });
            }
        });

        logger.debug('Library grouping completed', {
            totalItems: zoteroKeys.length,
            librariesFound: Object.keys(libraries).length
        });

        return libraries;
    }

    /**
     * 生成Zotero选择字符串
     * @param {object} libraries - 按库分组的条目
     * @returns {object} 包含选择字符串的库对象
     */
    function generateSelectionStrings(libraries) {
        const logger = getLogger();
        logger.debug('Generating Zotero selection strings');

        const selectionPrefix = getConfig('ZOTERO.SELECTION_PREFIX', 'zotero://select/');
        const userType = getConfig('ZOTERO.LIBRARY_TYPES.USERS', 'users');
        const groupType = getConfig('ZOTERO.LIBRARY_TYPES.GROUPS', 'groups');

        for (const libraryUrl in libraries) {
            try {
                const library = libraries[libraryUrl];
                
                if (!library.items || library.items.length === 0) {
                    logger.warn('Library has no items', { libraryUrl });
                    continue;
                }

                const itemKeys = library.items.join(',');

                switch (library.type) {
                    case userType:
                        // 用户库选择字符串格式: zotero://select/library/items?itemKey=ABCD2345,BCDE9876
                        library.selectionString = `${selectionPrefix}library/items?itemKey=${itemKeys}`;
                        break;

                    case groupType:
                        // 群组库选择字符串格式: zotero://select/groups/227594/items?itemKey=2TK9HDKD
                        library.selectionString = `${selectionPrefix}groups/${library.subID}/items?itemKey=${itemKeys}`;
                        break;

                    default:
                        logger.warn('Unknown library type', { libraryUrl, type: library.type });
                        continue;
                }

                logger.debug('Generated selection string for library', {
                    libraryUrl,
                    type: library.type,
                    itemCount: library.items.length,
                    selectionString: library.selectionString
                });

            } catch (error) {
                logger.warn('Error generating selection string for library', {
                    libraryUrl,
                    error: error.message
                });
            }
        }

        return libraries;
    }

    /**
     * 更新集成统计信息
     * @param {object} stats - 统计信息
     */
    function updateIntegrationStats(stats) {
        integrationStats = {
            ...integrationStats,
            ...stats,
            lastProcessed: new Date().toISOString()
        };
    }

    // 公共API
    const ZoteroIntegration = {
        /**
         * 处理引用以生成Zotero选择器
         * @param {array} citations - 引用数组
         * @returns {object} 处理结果
         */
        processZoteroIntegration(citations) {
            const logger = getLogger();
            const errorHandler = getErrorHandler();

            logger.startTiming('zotero_integration');
            logger.info('Starting Zotero integration processing', { citationCount: citations.length });

            try {
                // 重置状态
                zoteroLibrarySelectors = {};
                zoteroItemKeys = [];

                updateIntegrationStats({
                    totalItems: citations.length,
                    zoteroItems: 0,
                    librariesFound: 0,
                    selectorsGenerated: 0
                });

                if (!Array.isArray(citations) || citations.length === 0) {
                    logger.info('No citations provided for Zotero integration');
                    return {
                        hasZoteroItems: false,
                        selectors: {},
                        statistics: integrationStats
                    };
                }

                // Step 1: 提取Zotero条目
                zoteroItemKeys = extractZoteroItems(citations);
                updateIntegrationStats({ zoteroItems: zoteroItemKeys.length });

                if (zoteroItemKeys.length === 0) {
                    logger.info('No Zotero items found in citations');
                    return {
                        hasZoteroItems: false,
                        selectors: {},
                        statistics: integrationStats
                    };
                }

                // Step 2: 按库分组
                const libraries = groupItemsByLibrary(zoteroItemKeys);
                updateIntegrationStats({ librariesFound: Object.keys(libraries).length });

                // Step 3: 生成选择字符串
                zoteroLibrarySelectors = generateSelectionStrings(libraries);
                
                const selectorsGenerated = Object.keys(zoteroLibrarySelectors).filter(
                    url => zoteroLibrarySelectors[url].selectionString
                ).length;
                updateIntegrationStats({ selectorsGenerated });

                const processingTime = logger.endTiming('zotero_integration');

                logger.info('Zotero integration processing completed', {
                    totalCitations: citations.length,
                    zoteroItems: zoteroItemKeys.length,
                    librariesFound: Object.keys(libraries).length,
                    selectorsGenerated,
                    processingTime: `${processingTime.toFixed(2)}ms`
                });

                return {
                    hasZoteroItems: zoteroItemKeys.length > 0,
                    selectors: zoteroLibrarySelectors,
                    statistics: {
                        ...integrationStats,
                        processingTime,
                        success: true
                    }
                };

            } catch (error) {
                logger.endTiming('zotero_integration');

                const handledError = errorHandler.handleError(
                    getConfig('ERROR_CODES.UNKNOWN_ERROR', 9999),
                    'Zotero integration processing failed',
                    error,
                    { citationCount: citations.length }
                );

                updateIntegrationStats({
                    success: false,
                    error: handledError.message
                });

                throw handledError;
            }
        },

        /**
         * 获取当前的Zotero库选择器
         * @returns {object} 库选择器对象
         */
        getZoteroSelectors() {
            return { ...zoteroLibrarySelectors };
        },

        /**
         * 获取当前的Zotero条目键
         * @returns {array} 条目键数组
         */
        getZoteroItemKeys() {
            return [...zoteroItemKeys];
        },

        /**
         * 获取集成统计信息
         * @returns {object} 统计信息
         */
        getIntegrationStats() {
            return { ...integrationStats };
        },

        /**
         * 清除Zotero集成数据
         */
        clearZoteroData() {
            const logger = getLogger();
            logger.debug('Clearing Zotero integration data');

            zoteroLibrarySelectors = {};
            zoteroItemKeys = [];
            integrationStats = {
                totalItems: 0,
                zoteroItems: 0,
                librariesFound: 0,
                selectorsGenerated: 0
            };
        },

        /**
         * 验证Zotero URI
         * @param {string} uri - 要验证的URI
         * @returns {object} 验证结果
         */
        validateZoteroUri(uri) {
            const result = {
                isValid: false,
                isZotero: false,
                parsed: null,
                errors: []
            };

            if (!uri || typeof uri !== 'string') {
                result.errors.push('URI must be a non-empty string');
                return result;
            }

            result.isZotero = isZoteroUri(uri);
            
            if (!result.isZotero) {
                result.errors.push('URI is not a Zotero URI');
                return result;
            }

            const parsed = parseZoteroUri(uri);
            if (parsed) {
                result.isValid = true;
                result.parsed = parsed;
            } else {
                result.errors.push('Failed to parse Zotero URI');
            }

            return result;
        },

        /**
         * 生成选择器信息用于UI显示
         * @returns {array} 选择器信息数组
         */
        getSelectorsForUI() {
            const selectors = [];

            for (const libraryUrl in zoteroLibrarySelectors) {
                const library = zoteroLibrarySelectors[libraryUrl];
                
                if (!library.selectionString) {
                    continue;
                }

                const libraryTypeLabel = library.type === getConfig('ZOTERO.LIBRARY_TYPES.GROUPS', 'groups') 
                    ? 'group' 
                    : 'user';

                selectors.push({
                    url: library.selectionString,
                    text: `Select ${library.items.length} item(s) for ${libraryTypeLabel} library ${library.subID}`,
                    libraryType: library.type,
                    libraryId: library.subID,
                    itemCount: library.items.length,
                    libraryUrl: libraryUrl
                });
            }

            return selectors.sort((a, b) => {
                // 按库类型排序（用户库在前），然后按条目数量排序
                if (a.libraryType !== b.libraryType) {
                    return a.libraryType === getConfig('ZOTERO.LIBRARY_TYPES.USERS', 'users') ? -1 : 1;
                }
                return b.itemCount - a.itemCount;
            });
        }
    };

    return ZoteroIntegration;
})();

// 导出模块（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorZoteroIntegration;
}
