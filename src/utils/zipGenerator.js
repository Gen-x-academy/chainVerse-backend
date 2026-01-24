const archiver = require('archiver');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const logger = require('./logger');

const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);

const TEMP_DIR = path.join(__dirname, '../../uploads/temp');

const ensureTempDir = async () => {
	try {
		await access(TEMP_DIR);
	} catch {
		await mkdir(TEMP_DIR, { recursive: true });
	}
};

const downloadFile = async (url) => {
	if (!url) {
		throw new Error('URL is required');
	}

	if (url.startsWith('http://') || url.startsWith('https://')) {
		const response = await axios.get(url, {
			responseType: 'arraybuffer',
			timeout: 30000,
		});
		return Buffer.from(response.data);
	}

	const filePath = url.startsWith('file://') ? url.slice(7) : url;
	return fs.promises.readFile(filePath);
};

const getTempZipPath = async (studentId) => {
	await ensureTempDir();
	const timestamp = Date.now();
	const filename = `certificates_${studentId}_${timestamp}.zip`;
	return path.join(TEMP_DIR, filename);
};

const createCertificateZip = async (certificateFiles, outputPath) => {
	if (!certificateFiles || certificateFiles.length === 0) {
		throw new Error('No certificate files provided');
	}

	return new Promise(async (resolve, reject) => {
		const output = fs.createWriteStream(outputPath);
		const archive = archiver('zip', {
			zlib: { level: 9 },
		});

		output.on('close', () => {
			logger.info(`ZIP created: ${archive.pointer()} bytes`);
			resolve(outputPath);
		});

		archive.on('error', (err) => {
			logger.error(`ZIP creation error: ${err.message}`);
			reject(err);
		});

		archive.pipe(output);

		for (const file of certificateFiles) {
			try {
				const buffer = await downloadFile(file.url);
				archive.append(buffer, { name: file.filename });
			} catch (error) {
				logger.error(`Failed to add file ${file.filename}: ${error.message}`);
			}
		}

		await archive.finalize();
	});
};

const cleanupTempFile = async (filePath) => {
	if (!filePath) return;

	try {
		await access(filePath);
		await unlink(filePath);
		logger.info(`Cleaned up temp file: ${filePath}`);
	} catch (error) {
		if (error.code !== 'ENOENT') {
			logger.error(`Cleanup failed: ${error.message}`);
		}
	}
};

const streamZipToResponse = async (zipPath, res, filename) => {
	try {
		await access(zipPath);

		const stat = await fs.promises.stat(zipPath);
		const sanitizedFilename = filename.replace(/[^a-z0-9_\-\.]/gi, '_');

		res.setHeader('Content-Type', 'application/zip');
		res.setHeader('Content-Length', stat.size);
		res.setHeader(
			'Content-Disposition',
			`attachment; filename="${sanitizedFilename}"`
		);

		const stream = fs.createReadStream(zipPath);
		
		stream.on('error', (error) => {
			logger.error(`Stream error: ${error.message}`);
			if (!res.headersSent) {
				res.status(500).json({ error: 'Failed to download file' });
			}
		});

		stream.on('end', async () => {
			await cleanupTempFile(zipPath);
		});

		stream.pipe(res);
	} catch (error) {
		logger.error(`Failed to stream ZIP: ${error.message}`);
		throw error;
	}
};

module.exports = {
	createCertificateZip,
	downloadFile,
	getTempZipPath,
	cleanupTempFile,
	streamZipToResponse,
};
