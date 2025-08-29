/**
 * @fileoverview 文档解析模块 - 处理Word(.docx)和LibreOffice(.odt)文档的解析
 * @version 1.0.0
 * @author Reference Extractor Team
 */

/**
 * RefExtractor文档解析器
 * 负责ZIP文件解析、文档类型识别和XML内容提取
 */
window.RefExtractorDocumentParser = (function() {
    'use strict';

    // 私有变量
    let currentDocument = null;
    let parsingState = {
        isProcessing: false,
        currentFile: null,
        progress: 0
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
     * 检测文档类型
     * @param {object} zip - JSZip对象
     * @returns {string|null} 文档类型或null
     */
    function detectDocumentType(zip) {
        const logger = getLogger();
        logger.debug('Detecting document type');

        const filesInZip = Object.keys(zip.files);
        
        // 检查OfficeOpenXML (.docx)
        const officeIndicator = getConfig('FILE_PATHS.OFFICE_OPEN_XML.INDICATOR_FILE', 'word/document.xml');
        if (filesInZip.includes(officeIndicator)) {
            logger.info('Document type detected: OfficeOpenXML (.docx)');
            return getConfig('DOCUMENT_TYPES.OFFICE_OPEN_XML', 'OfficeOpenXML');
        }

        // 检查OpenDocument (.odt)
        const odtIndicator = getConfig('FILE_PATHS.OPEN_DOCUMENT.INDICATOR_FILE', 'content.xml');
        if (filesInZip.includes(odtIndicator)) {
            logger.info('Document type detected: OpenDocument (.odt)');
            return getConfig('DOCUMENT_TYPES.OPEN_DOCUMENT', 'OpenDocument');
        }

        logger.warn('Unknown document type', { availableFiles: filesInZip });
        return null;
    }

    /**
     * 获取需要提取的文件列表
     * @param {string} documentType - 文档类型
     * @param {array} availableFiles - ZIP中可用的文件列表
     * @returns {object} 包含内容文件和样式文件的对象
     */
    function getFilesToExtract(documentType, availableFiles) {
        const logger = getLogger();
        logger.debug('Determining files to extract', { documentType });

        let contentFiles = [];
        let styleFile = '';

        if (documentType === getConfig('DOCUMENT_TYPES.OFFICE_OPEN_XML')) {
            const possibleContentFiles = getConfig('FILE_PATHS.OFFICE_OPEN_XML.CONTENT_FILES', [
                'word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'
            ]);
            styleFile = getConfig('FILE_PATHS.OFFICE_OPEN_XML.STYLE_FILE', 'docProps/custom.xml');
            
            // 只包含实际存在的文件
            contentFiles = availableFiles.filter(file => possibleContentFiles.includes(file));
        } else if (documentType === getConfig('DOCUMENT_TYPES.OPEN_DOCUMENT')) {
            const possibleContentFiles = getConfig('FILE_PATHS.OPEN_DOCUMENT.CONTENT_FILES', ['content.xml']);
            styleFile = getConfig('FILE_PATHS.OPEN_DOCUMENT.STYLE_FILE', 'meta.xml');
            
            contentFiles = availableFiles.filter(file => possibleContentFiles.includes(file));
        }

        logger.debug('Files to extract determined', { 
            contentFiles, 
            styleFile, 
            availableCount: contentFiles.length 
        });

        return {
            contentFiles,
            styleFile,
            hasStyleFile: availableFiles.includes(styleFile)
        };
    }

    /**
     * 验证ZIP文件完整性
     * @param {object} zip - JSZip对象
     * @returns {boolean} 是否有效
     */
    function validateZipFile(zip) {
        const logger = getLogger();
        
        try {
            // 检查基本结构
            if (!zip || !zip.files) {
                logger.error('Invalid ZIP structure: missing files property');
                return false;
            }

            const fileCount = Object.keys(zip.files).length;
            if (fileCount === 0) {
                logger.error('Invalid ZIP structure: no files found');
                return false;
            }

            logger.debug('ZIP file validation passed', { fileCount });
            return true;
        } catch (error) {
            logger.error('ZIP validation failed', error);
            return false;
        }
    }

    /**
     * 提取XML内容
     * @param {object} zip - JSZip对象
     * @param {string} fileName - 文件名
     * @returns {Promise<string>} XML内容
     */
    async function extractXmlContent(zip, fileName) {
        const logger = getLogger();
        const errorHandler = getErrorHandler();

        try {
            logger.debug(`Extracting XML content from: ${fileName}`);

            const file = zip.file(fileName);
            if (!file) {
                throw new Error(`File not found in ZIP: ${fileName}`);
            }

            const content = await file.async('string');
            
            if (!content || content.trim().length === 0) {
                throw new Error(`Empty content in file: ${fileName}`);
            }

            logger.debug(`Successfully extracted XML content from: ${fileName}`, {
                contentLength: content.length
            });

            return content;
        } catch (error) {
            const handledError = errorHandler.handleError(
                getConfig('ERROR_CODES.XML_PARSE_ERROR', 2001),
                `Failed to extract XML content from ${fileName}`,
                error,
                { fileName, zipFiles: Object.keys(zip.files) }
            );
            throw handledError;
        }
    }

    /**
     * 并行提取多个文件内容
     * @param {object} zip - JSZip对象
     * @param {array} fileNames - 文件名列表
     * @returns {Promise<array>} 提取的内容数组
     */
    async function extractMultipleFiles(zip, fileNames) {
        const logger = getLogger();
        logger.startTiming('extract_multiple_files');

        try {
            const extractPromises = fileNames.map(fileName => extractXmlContent(zip, fileName));
            const contents = await Promise.all(extractPromises);
            
            logger.endTiming('extract_multiple_files');
            logger.info('Multiple files extracted successfully', {
                fileCount: fileNames.length,
                totalLength: contents.reduce((sum, content) => sum + content.length, 0)
            });

            return contents;
        } catch (error) {
            logger.endTiming('extract_multiple_files');
            throw error;
        }
    }

    /**
     * 解析文档对象
     * @param {File} file - 文件对象
     * @returns {Promise<object>} 解析结果
     */
    async function parseDocument(file) {
        const logger = getLogger();
        const errorHandler = getErrorHandler();

        // 更新解析状态
        parsingState.isProcessing = true;
        parsingState.currentFile = file.name;
        parsingState.progress = 0;

        logger.startTiming('document_parsing');
        logger.info('Starting document parsing', {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type
        });

        try {
            // Step 1: 加载ZIP文件
            logger.debug('Loading ZIP file');
            parsingState.progress = 10;
            
            const zip = await JSZip.loadAsync(file);
            
            // Step 2: 验证ZIP文件
            logger.debug('Validating ZIP file');
            parsingState.progress = 20;
            
            if (!validateZipFile(zip)) {
                throw new Error('Invalid or corrupted ZIP file');
            }

            // Step 3: 检测文档类型
            logger.debug('Detecting document type');
            parsingState.progress = 30;
            
            const documentType = detectDocumentType(zip);
            if (!documentType) {
                throw new Error('Unsupported document type');
            }

            // Step 4: 确定要提取的文件
            logger.debug('Determining files to extract');
            parsingState.progress = 40;
            
            const availableFiles = Object.keys(zip.files);
            const filesToExtract = getFilesToExtract(documentType, availableFiles);

            if (filesToExtract.contentFiles.length === 0) {
                throw new Error('No extractable content files found');
            }

            // Step 5: 提取内容文件
            logger.debug('Extracting content files');
            parsingState.progress = 60;
            
            const contentFiles = await extractMultipleFiles(zip, filesToExtract.contentFiles);

            // Step 6: 提取样式文件（如果存在）
            logger.debug('Extracting style file');
            parsingState.progress = 80;
            
            let styleContent = null;
            if (filesToExtract.hasStyleFile) {
                try {
                    styleContent = await extractXmlContent(zip, filesToExtract.styleFile);
                } catch (error) {
                    logger.warn('Failed to extract style file, continuing without it', {
                        styleFile: filesToExtract.styleFile,
                        error: error.message
                    });
                }
            }

            // Step 7: 创建文档对象
            parsingState.progress = 90;
            
            const documentObj = {
                type: documentType,
                fileName: file.name,
                fileSize: file.size,
                contentFiles: contentFiles,
                styleContent: styleContent,
                extractedFiles: filesToExtract.contentFiles,
                styleFile: filesToExtract.styleFile,
                parsedAt: new Date().toISOString(),
                metadata: {
                    totalFiles: availableFiles.length,
                    extractedFiles: filesToExtract.contentFiles.length,
                    hasStyleFile: filesToExtract.hasStyleFile
                }
            };

            // 保存当前文档
            currentDocument = documentObj;
            parsingState.progress = 100;

            logger.endTiming('document_parsing');
            logger.info('Document parsing completed successfully', {
                documentType,
                contentFilesCount: contentFiles.length,
                hasStyleContent: !!styleContent
            });

            return documentObj;

        } catch (error) {
            logger.endTiming('document_parsing');
            
            // 处理特定错误类型
            let errorCode = getConfig('ERROR_CODES.FILE_PARSE_ERROR', 1002);
            let errorMessage = 'Document parsing failed';

            if (error.message.includes('corrupted') || error.message.includes('Invalid')) {
                errorCode = getConfig('ERROR_CODES.CORRUPTED_ZIP', 1004);
                errorMessage = 'Document file is corrupted or invalid';
            } else if (error.message.includes('Unsupported')) {
                errorCode = getConfig('ERROR_CODES.INVALID_FILE_TYPE', 1003);
                errorMessage = 'Unsupported document type';
            }

            const handledError = errorHandler.handleError(
                errorCode,
                errorMessage,
                error,
                {
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
                    progress: parsingState.progress
                }
            );

            throw handledError;
        } finally {
            // 重置解析状态
            parsingState.isProcessing = false;
            parsingState.currentFile = null;
            parsingState.progress = 0;
        }
    }

    // 公共API
    const DocumentParser = {
        /**
         * 解析文档文件
         * @param {File} file - 要解析的文件
         * @returns {Promise<object>} 解析结果
         */
        async parse(file) {
            const logger = getLogger();
            const errorHandler = getErrorHandler();

            // 验证输入
            if (!file) {
                throw errorHandler.handleError(
                    getConfig('ERROR_CODES.FILE_READ_ERROR', 1001),
                    'No file provided for parsing',
                    null,
                    { file }
                );
            }

            if (!(file instanceof File)) {
                throw errorHandler.handleError(
                    getConfig('ERROR_CODES.FILE_READ_ERROR', 1001),
                    'Invalid file object provided',
                    null,
                    { fileType: typeof file }
                );
            }

            // 检查文件大小
            const maxSize = 50 * 1024 * 1024; // 50MB限制
            if (file.size > maxSize) {
                throw errorHandler.handleError(
                    getConfig('ERROR_CODES.FILE_READ_ERROR', 1001),
                    'File size too large',
                    null,
                    { fileSize: file.size, maxSize }
                );
            }

            logger.info('Starting document parsing', {
                fileName: file.name,
                fileSize: file.size
            });

            return await parseDocument(file);
        },

        /**
         * 获取当前解析的文档
         * @returns {object|null} 当前文档对象
         */
        getCurrentDocument() {
            return currentDocument;
        },

        /**
         * 获取解析状态
         * @returns {object} 解析状态信息
         */
        getParsingState() {
            return { ...parsingState };
        },

        /**
         * 检查是否正在解析
         * @returns {boolean} 是否正在解析
         */
        isProcessing() {
            return parsingState.isProcessing;
        },

        /**
         * 清除当前文档
         */
        clearCurrentDocument() {
            const logger = getLogger();
            logger.debug('Clearing current document');
            currentDocument = null;
        },

        /**
         * 验证文档类型支持
         * @param {File} file - 文件对象
         * @returns {boolean} 是否支持该文档类型
         */
        isDocumentTypeSupported(file) {
            if (!file || !file.name) {
                return false;
            }

            const fileName = file.name.toLowerCase();
            return fileName.endsWith('.docx') || fileName.endsWith('.odt');
        },

        /**
         * 获取支持的文件类型信息
         * @returns {object} 支持的文件类型信息
         */
        getSupportedTypes() {
            return {
                extensions: ['.docx', '.odt'],
                mimeTypes: [
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'application/vnd.oasis.opendocument.text'
                ],
                descriptions: {
                    '.docx': 'Microsoft Word Document (Office Open XML)',
                    '.odt': 'OpenDocument Text (LibreOffice/OpenOffice)'
                }
            };
        },

        /**
         * 获取解析统计信息
         * @returns {object} 解析统计
         */
        getParsingStats() {
            return {
                currentDocument: currentDocument ? {
                    fileName: currentDocument.fileName,
                    type: currentDocument.type,
                    fileSize: currentDocument.fileSize,
                    parsedAt: currentDocument.parsedAt,
                    contentFilesCount: currentDocument.contentFiles.length,
                    hasStyleContent: !!currentDocument.styleContent
                } : null,
                isProcessing: parsingState.isProcessing,
                currentFile: parsingState.currentFile,
                progress: parsingState.progress
            };
        }
    };

    return DocumentParser;
})();

// 导出模块（兼容不同模块系统）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = window.RefExtractorDocumentParser;
}
