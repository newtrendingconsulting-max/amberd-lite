/**
 * Extends the Nest CLI webpack config.
 *
 * pdfkit, pdf-parse (pdf.js) and exceljs load fonts, workers and data files
 * from their own package directories at runtime, which breaks once bundled,
 * so they are required from node_modules instead.
 */
const RUNTIME_PACKAGES = ['pdfkit', 'pdf-parse', 'exceljs'];

module.exports = (options) => {
  const existing = options.externals ? (Array.isArray(options.externals) ? options.externals : [options.externals]) : [];
  return {
    ...options,
    externals: [
      ...existing,
      Object.fromEntries(RUNTIME_PACKAGES.map((name) => [name, `commonjs ${name}`])),
    ],
  };
};
