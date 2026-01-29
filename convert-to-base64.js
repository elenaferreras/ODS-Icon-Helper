const fs = require('fs');
const path = './assets/cover-image.png'; // change to your image path

// Read image file
const imageBuffer = fs.readFileSync(path);

// Convert to Base64
const base64Image = imageBuffer.toString('base64');

// Print Base64 string (prepend with data URI)
console.log(`data:image/png;base64,${base64Image}`);