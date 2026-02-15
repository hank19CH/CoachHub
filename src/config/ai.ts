export const AI_CONFIG = {
  import: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    supportedTypes: [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv',
      'application/pdf',
      'image/jpeg',
      'image/png'
    ],
    supportedExtensions: ['.xlsx', '.xls', '.csv', '.pdf', '.jpg', '.jpeg', '.png'],
    estimatedCostPerImport: 0.0005 // USD
  },

  philosophy: {
    analysisThreshold: 10, // analyze every N programs
    estimatedCostPerAnalysis: 0.03 // USD
  }
}
