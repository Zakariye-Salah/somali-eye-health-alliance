const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

// IMPORTANT: __dirname for this file is Backend/routes, so go up two levels
// to reach the project root, then into Frontend/images
const IMAGES_DIR = path.resolve(__dirname, '..', '..', 'Frontend', 'images');

function isImageFile(name) {
  return /\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(name);
}

// GET /api/images
router.get('/', async (req, res) => {
  try {
    if (!fs.existsSync(IMAGES_DIR)) {
      console.warn('images route: IMAGES_DIR not found:', IMAGES_DIR);
      return res.json([]);
    }
    const files = await fs.promises.readdir(IMAGES_DIR);
    const images = files.filter(isImageFile).map(fname => ({
      name: fname,
      url: '/images/' + fname
    }));
    console.log('images route: IMAGES_DIR=', IMAGES_DIR, 'found files=', images.length);
    res.json(images);
  } catch (err) {
    console.error('error listing images', err);
    res.status(500).json({ message: 'Failed to list images' });
  }
});

module.exports = router;
