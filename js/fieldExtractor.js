/**
 * @fileoverview 字段提取模块 - 从不同文档类型中提取引用字段和样式信息
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor字段提取器
 * 专门负责从OfficeOpenXML和OpenDocument格式中提取引用字段和CSL样式信息
 */
window.RefExtractorFieldExtractor = (function() {
    'use strict';

    // 私有变量
    let extractionCache = new Map();
    let extractionStats = {
        totalExtractions: 0,
        successfulExtractions: 0,
        fieldCount: 0,
        styleExtractions: 0
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
     * 解析XML字符串为DOM对象
     * @param {string} xmlString - XML字符串
     * @param {string} fileName - 文件名（用于错误信息）
     * @returns {Document} 解析后的DOM对象
     */
    function parseXmlString(xmlString, fileName = 'unknown') {
        const logger = getLogger();
        const errorHandler = getErrorHandler();

        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

            // 检查解析错误
            const parseError = xmlDoc.querySelector('parsererror');
            if (parseError) {
                throw new Error(`XML Parse Error: ${parseError.textContent}`);
            }

            logger.debug(`Successfully parsed XML for: ${fileName}`);
            return xmlDoc;
        } catch (error) {
            const handledError = errorHandler.handleError(
                getConfig('ERROR_CODES.XML_PARSE_ERROR', 2001),
                `Failed to parse XML from ${fileName}`,
                error,
                { fileName, xmlLength: xmlString.length }
            );
            throw handledError;
        }
    }

    /**
     * 从OfficeOpenXML文档提取字段
     * @param {string} xmlContent - XML内容
     * @param {string} fileName - 文件名
     * @returns {array} 提取的字段数组
     */
    function extractOfficeOpenXmlFields(xmlContent, fileName) {
        const logger = getLogger();
        logger.debug(`Extracting OfficeOpenXML fields from: ${fileName}`);

        const fields = [];
        const parsedDOM = parseXmlString(xmlContent, fileName);

        try {
            // 定位复杂字段的开始标记 (<w:fldChar w:fldCharType="begin"/>)
            const fieldCharBeginSelector = getConfig('XML_SELECTORS.OFFICE_OPEN_XML.FIELD_CHAR_BEGIN');
            const complexFieldStarts = parsedDOM.querySelectorAll(fieldCharBeginSelector);

            logger.debug(`Found ${complexFieldStarts.length} complex field starts in ${fileName}`);

            for (let i = 0; i < complexFieldStarts.length; i++) {
                try {
                    const fieldContent = extractComplexFieldContent(complexFieldStarts[i], parsedDOM);
                    if (fieldContent && fieldContent.trim().length > 0) {
                        fields.push(fieldContent);
                        logger.debug(`Extracted field ${i + 1}: ${fieldContent.substring(0, 100)}...`);
                    }
                } catch (fieldError) {
                    logger.warn(`Failed to extract field ${i + 1} from ${fileName}`, fieldError);
                }
            }

            logger.info(`Successfully extracted ${fields.length} fields from ${fileName}`);
            return fields;

        } catch (error) {
            logger.error(`Failed to extract OfficeOpenXML fields from ${fileName}`, error);
            throw error;
        }
    }

    /**
     * 提取复杂字段内容
     * @param {Element} fieldStart - 字段开始元素
     * @param {Document} xmlDoc - XML文档对象
     * @returns {string} 字段内容
     */
    function extractComplexFieldContent(fieldStart, xmlDoc) {
        const logger = getLogger();
        let instrTextContent = '';

        try {
            // 访问兄弟<w:r>元素直到找到结束标记
            let nextRun = fieldStart.parentElement.nextSibling;
            let iterationCount = 0;
            const maxIterations = 1000; // 防止无限循环

            while (nextRun && iterationCount < maxIterations) {
                iterationCount++;

                // 检查是否到达字段结束标记
                const fieldCharEndSelector = getConfig('XML_SELECTORS.OFFICE_OPEN_XML.FIELD_CHAR_END');
                const endRun = nextRun.querySelectorAll ? nextRun.querySelectorAll(fieldCharEndSelector) : [];
                
                if (endRun.length > 0) {
                    logger.debug('Found field end marker');
                    break;
                }

                // 获取指令文本内容
                if (nextRun.getElementsByTagName) {
                    const instrTextSelector = getConfig('XML_SELECTORS.OFFICE_OPEN_XML.INSTR_TEXT', 'w:instrText');
                    const instrTextFields = nextRun.getElementsByTagName(instrTextSelector);
                    
                    for (let j = 0; j < instrTextFields.length; j++) {
                        const textContent = instrTextFields[j].textContent || '';
                        instrTextContent += textContent;
                    }
                }

                nextRun = nextRun.nextSibling;
            }

            if (iterationCount >= maxIterations) {
                logger.warn('Reached maximum iterations while extracting complex field content');
            }

            return instrTextContent.trim();

        } catch (error) {
            logger.warn('Error extracting complex field content', error);
            return '';
        }
    }

    /**
     * 从OpenDocument文档提取字段
     * @param {string} xmlContent - XML内容
     * @param {string} fileName - 文件名
     * @returns {array} 提取的字段数组
     */
    function extractOpenDocumentFields(xmlContent, fileName) {
        const logger = getLogger();
        logger.debug(`Extracting OpenDocument fields from: ${fileName}`);

        const fields = [];
        const parsedDOM = parseXmlString(xmlContent, fileName);

        try {
            // Zotero在使用引用标记时，将引用存储在<text:reference-mark-start>元素的text:name属性中
            const referenceMarkSelector = getConfig('XML_SELECTORS.OPEN_DOCUMENT.REFERENCE_MARKS');
            const referenceMarks = parsedDOM.querySelectorAll(referenceMarkSelector);

            logger.debug(`Found ${referenceMarks.length} reference marks in ${fileName}`);

            for (let i = 0; i < referenceMarks.length; i++) {
                try {
                    const nameAttribute = referenceMarks[i].getAttribute('text:name');
                    if (nameAttribute && nameAttribute.trim().length > 0) {
                        fields.push(nameAttribute.trim());
                        logger.debug(`Extracted reference mark ${i + 1}: ${nameAttribute.substring(0, 100)}...`);
                    }
                } catch (fieldError) {
                    logger.warn(`Failed to extract reference mark ${i + 1} from ${fileName}`, fieldError);
                }
            }

            logger.info(`Successfully extracted ${fields.length} reference marks from ${fileName}`);
            return fields;

        } catch (error) {
            logger.error(`Failed to extract OpenDocument fields from ${fileName}`, error);
            throw error;
        }
    }

    /**
     * 提取Mendeley CSL样式
     * @param {Document} customXmlDOM - 自定义XML DOM对象
     * @returns {string} Mendeley样式ID
     */
    function extractMendeleyCSLStyle(customXmlDOM) {
        const logger = getLogger();
        logger.debug('Extracting Mendeley CSL style');

        try {
            const styleSelector = getConfig('XML_SELECTORS.STYLE_SELECTORS.MENDELEY');
            const field = customXmlDOM.querySelector(styleSelector);
            
            if (field && field.firstElementChild) {
                const styleId = field.firstElementChild.textContent || '';
                logger.debug(`Found Mendeley style: ${styleId}`);
                return styleId.trim();
            }

            logger.debug('No Mendeley style found');
            return '';

        } catch (error) {
            logger.warn('Error extracting Mendeley CSL style', error);
            return '';
        }
    }

    /**
     * 提取Zotero CSL样式
     * @param {Document} customXmlDOM - 自定义XML DOM对象
     * @param {string} documentType - 文档类型
     * @returns {string} Zotero样式ID
     */
    function extractZoteroCSLStyle(customXmlDOM, documentType) {
        const logger = getLogger();
        logger.debug('Extracting Zotero CSL style', { documentType });

        try {
            let selector = '';
            
            if (documentType === getConfig('DOCUMENT_TYPES.OFFICE_OPEN_XML')) {
                selector = getConfig('XML_SELECTORS.STYLE_SELECTORS.ZOTERO_OFFICE');
            } else if (documentType === getConfig('DOCUMENT_TYPES.OPEN_DOCUMENT')) {
                selector = getConfig('XML_SELECTORS.STYLE_SELECTORS.ZOTERO_ODT');
            }

            if (!selector) {
                logger.warn('No selector defined for document type', { documentType });
                return '';
            }

            const fields = customXmlDOM.querySelectorAll(selector);
            let zoteroPrefs = '';

            // 连接所有Zotero首选项字段
            for (let i = 0; i < fields.length; i++) {
                const textContent = fields[i].textContent || '';
                zoteroPrefs += textContent;
            }

            if (zoteroPrefs.length === 0) {
                logger.debug('No Zotero preferences found');
                return '';
            }

            // 在ODT文件中，元素包含转义的XML
            if (documentType === getConfig('DOCUMENT_TYPES.OPEN_DOCUMENT')) {
                zoteroPrefs = unescapeXmlEntities(zoteroPrefs);
            }

            // 解析首选项XML以提取样式ID
            const styleId = parseZoteroStyleId(zoteroPrefs);
            logger.debug(`Found Zotero style: ${styleId}`);
            return styleId;

        } catch (error) {
            logger.warn('Error extracting Zotero CSL style', error);
            return '';
        }
    }

    /**
     * 反转义XML实体
     * @param {string} xmlString - 包含转义实体的XML字符串
     * @returns {string} 反转义后的字符串
     */
    function unescapeXmlEntities(xmlString) {
        return xmlString.replace(
            /&quot;|&lt;|&gt;|&amp;|&apos;/g,
            function(match) {
                switch (match) {
                    case '&quot;': return '"';
                    case '&lt;': return '<';
                    case '&gt;': return '>';
                    case '&apos;': return "'";
                    case '&amp;': return '&';
                    default: return match;
                }
            }
        );
    }

    /**
     * 解析Zotero样式ID
     * @param {string} zoteroPrefs - Zotero首选项字符串
     * @returns {string} 样式ID
     */
    function parseZoteroStyleId(zoteroPrefs) {
        const logger = getLogger();

        try {
            if (zoteroPrefs.length === 0) {
                return '';
            }

            const lpwstrDOM = parseXmlString(zoteroPrefs, 'zotero-preferences');
            const selectedStyleNode = lpwstrDOM.querySelector('style[id]');
            
            if (selectedStyleNode) {
                const styleId = selectedStyleNode.getAttribute('id') || '';
                return styleId.trim();
            }

            logger.debug('No style node with id attribute found in Zotero preferences');
            return '';

        } catch (error) {
            logger.warn('Error parsing Zotero style ID', error);
            return '';
        }
    }

    /**
     * 清理样式ID（移除URL前缀）
     * @param {string} styleId - 原始样式ID
     * @returns {string} 清理后的样式ID
     */
    function cleanStyleId(styleId) {
        if (!styleId) return '';
        
        // 移除Zotero样式URL前缀
        const zoteroStylePrefix = 'http://www.zotero.org/styles/';
        if (styleId.startsWith(zoteroStylePrefix)) {
            return styleId.substring(zoteroStylePrefix.length);
        }
        
        return styleId;
    }

    // 公共API
    const FieldExtractor = {
        /**
         * 从文档内容中提取字段
         * @param {array} contentFiles - 内容文件数组
         * @param {string} documentType - 文档类型
         * @returns {array} 提取的字段数组
         */
        extractFields(contentFiles, documentType) {
            const logger = getLogger();
            const errorHandler = getErrorHandler();

            logger.startTiming('field_extraction');
            logger.info('Starting field extraction', {
                documentType,
                fileCount: contentFiles.length
            });

            extractionStats.totalExtractions++;

            try {
                let allFields = [];

                // 根据文档类型选择提取方法
                const extractionMethod = documentType === getConfig('DOCUMENT_TYPES.OFFICE_OPEN_XML') 
                    ? extractOfficeOpenXmlFields 
                    : extractOpenDocumentFields;

                // 从每个内容文件中提取字段
                contentFiles.forEach((content, index) => {
                    try {
                        const fileName = `content_file_${index + 1}`;
                        const fields = extractionMethod(content, fileName);
                        allFields = allFields.concat(fields);
                        
                        logger.debug(`Extracted ${fields.length} fields from ${fileName}`);
                    } catch (fileError) {
                        logger.warn(`Failed to extract fields from content file ${index + 1}`, fileError);
                    }
                });

                extractionStats.successfulExtractions++;
                extractionStats.fieldCount += allFields.length;

                logger.endTiming('field_extraction');
                logger.info('Field extraction completed', {
                    totalFields: allFields.length,
                    documentType
                });

                return allFields;

            } catch (error) {
                logger.endTiming('field_extraction');
                
                const handledError = errorHandler.handleError(
                    getConfig('ERROR_CODES.CITATION_PARSE_ERROR', 3001),
                    'Field extraction failed',
                    error,
                    { documentType, fileCount: contentFiles.length }
                );
                
                throw handledError;
            }
        },

        /**
         * 提取CSL样式信息
         * @param {string} styleContent - 样式文件内容
         * @param {string} documentType - 文档类型
         * @returns {object} 样式信息对象
         */
        extractStyleInfo(styleContent, documentType) {
            const logger = getLogger();
            const errorHandler = getErrorHandler();

            if (!styleContent) {
                logger.debug('No style content provided');
                return {
                    mendeley: '',
                    zotero: '',
                    combined: '',
                    cleaned: ''
                };
            }

            logger.startTiming('style_extraction');
            logger.debug('Starting style extraction', { documentType });

            extractionStats.styleExtractions++;

            try {
                const parsedDOM = parseXmlString(styleContent, 'style-file');

                // 提取Mendeley和Zotero样式
                const mendeleyStyle = extractMendeleyCSLStyle(parsedDOM);
                const zoteroStyle = extractZoteroCSLStyle(parsedDOM, documentType);

                // 合并样式信息（只包含非空值）
                const styles = [mendeleyStyle, zoteroStyle].filter(style => style.length > 0);
                const combinedStyle = styles.join(', ');
                const cleanedStyle = cleanStyleId(combinedStyle);

                const styleInfo = {
                    mendeley: mendeleyStyle,
                    zotero: zoteroStyle,
                    combined: combinedStyle,
                    cleaned: cleanedStyle,
                    hasStyle: combinedStyle.length > 0
                };

                logger.endTiming('style_extraction');
                logger.info('Style extraction completed', styleInfo);

                return styleInfo;

            } catch (error) {
                logger.endTiming('style_extraction');
                
                logger.warn('Style extraction failed, continuing without style info', error);
                
                // 样式提取失败不应阻止主要功能
                return {
                    mendeley: '',
                    zotero: '',
                    combined: '',
                    cleaned: '',
                    error: error.message
                };
            }
        },

        /**
         * 验证提取的字段
         * @param {array} fields - 字段数组
         * @returns {object} 验证结果
         */
        validateFields(fields) {
            const logger = getLogger();
            
            if (!Array.isArray(fields)) {
                return {
                    isValid: false,
                    errors: ['Fields must be an array'],
                    warnings: [],
                    validFields: []
                };
            }

            const validFields = [];
            const warnings = [];
            const errors = [];

            // 获取引用字段前缀正则
            const cslPrefix = getConfig('CITATION_PREFIXES.CSL_GENERAL');

            fields.forEach((field, index) => {
                if (typeof field !== 'string') {
                    errors.push(`Field ${index + 1} is not a string`);
                    return;
                }

                const trimmedField = field.trim();
                
                if (trimmedField.length === 0) {
                    warnings.push(`Field ${index + 1} is empty`);
                    return;
                }

                // 检查是否是有效的CSL引用字段
                if (cslPrefix.test(trimmedField)) {
                    validFields.push(trimmedField);
                } else {
                    warnings.push(`Field ${index + 1} does not match CSL citation pattern`);
                }
            });

            const result = {
                isValid: errors.length === 0,
                errors,
                warnings,
                validFields,
                statistics: {
                    total: fields.length,
                    valid: validFields.length,
                    invalid: errors.length,
                    suspicious: warnings.length
                }
            };

            logger.debug('Field validation completed', result.statistics);
            return result;
        },

        /**
         * 获取提取统计信息
         * @returns {object} 统计信息
         */
        getExtractionStats() {
            return { ...extractionStats };
        },

        /**
         * 重置统计信息
         */
        resetStats() {
            extractionStats = {
                totalExtractions: 0,
                successfulExtractions: 0,
                fieldCount: 0,
                styleExtractions: 0
            };
            getLogger().debug('Extraction statistics reset');
        },

        /**
         * 清除提取缓存
         */
        clearCache() {
            extractionCache.clear();
            getLogger().debug('Extraction cache cleared');
        },

        /**
         * 获取支持的文档类型
         * @returns {array} 支持的文档类型列表
         */
        getSupportedDocumentTypes() {
            return [
                getConfig('DOCUMENT_TYPES.OFFICE_OPEN_XML'),
                getConfig('DOCUMENT_TYPES.OPEN_DOCUMENT')
            ];
        }
    };

    return FieldExtractor;
})();

// 导出模块（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorFieldExtractor;
}
