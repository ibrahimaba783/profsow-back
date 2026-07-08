const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Stockage pour les images (Avatars, miniatures des cours)
const imageStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'profsow/images',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 500, height: 500, crop: 'limit' }]
  },
});

// Stockage pour les fichiers PDF des cours
const pdfStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'profsow/pdfs',
    resource_type: 'auto', // Permet de gérer les documents PDF
    flags: 'attachment' // Indique qu'il s'agit d'une pièce jointe
  },
});

const uploadImage = multer({ storage: imageStorage });
const uploadPdf = multer({ storage: pdfStorage });

module.exports = {
  cloudinary,
  uploadImage,
  uploadPdf,
};
