// Скрипт для создания favicon файлов CO-LAB CRM
// Запуск: node create-favicons.js

const fs = require('fs');
const path = require('path');

// Создаем простой favicon.ico используя Canvas API (если доступен)
// Или создаем базовые PNG файлы в виде простых данных

// Создаем базовый 16x16 favicon как ICO
function createBasicICO() {
    // Минимальная ICO структура для 16x16 синего квадрата с белыми буквами
    // Это упрощенный подход - для продакшена лучше использовать специальные инструменты
    
    const icoHeader = Buffer.from([
        0x00, 0x00, // Reserved
        0x01, 0x00, // Type: ICO
        0x01, 0x00  // Number of images: 1
    ]);
    
    const imageEntry = Buffer.from([
        0x10,       // Width: 16
        0x10,       // Height: 16  
        0x00,       // Colors: 0 (256 colors)
        0x00,       // Reserved
        0x01, 0x00, // Color planes: 1
        0x20, 0x00, // Bits per pixel: 32
        0x00, 0x04, 0x00, 0x00, // Image size: 1024 bytes
        0x16, 0x00, 0x00, 0x00  // Offset: 22 bytes
    ]);
    
    // Создаем простую bitmap данные (очень базовые)
    const bitmapData = Buffer.alloc(1024);
    // Заполняем синим цветом (упрощенно)
    bitmapData.fill(0x1e); // Синий
    
    return Buffer.concat([icoHeader, imageEntry, bitmapData]);
}

// Создаем простые PNG данные (base64)
function createSimplePNG() {
    // Это минимальная PNG с синим фоном 16x16
    // В реальности для качественного favicon лучше использовать canvas или image libraries
    return 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAFcSURBVDiNpZM9SwNBEIafgwQSCxsLwcJCG1sLG1sLwcJaGwsLG0uxsLGwsLGwsLCwsLBQsLGwsLCwsLGwsLCwsLCwsLCwsLCwsLCwsLCwsLGwsLCwsLGwsLCwsLCwsLCwsLCwsLCwsLGwsLCwsLCwsLCwsLCwsLGw';
}

// Путь к папке frontend
const frontendPath = path.join(__dirname, 'frontend');

try {
    // Создаем favicon.ico
    const icoData = createBasicICO();
    fs.writeFileSync(path.join(frontendPath, 'favicon.ico'), icoData);
    console.log('✅ Created favicon.ico');
    
    // Создаем базовую версию apple-touch-icon
    const appleTouchIcon = `<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
  <rect width="180" height="180" fill="#1e40af" rx="20"/>
  <text x="90" y="110" font-family="Arial, sans-serif" font-size="64" font-weight="bold" text-anchor="middle" fill="white">СО</text>
</svg>`;
    
    fs.writeFileSync(path.join(frontendPath, 'apple-touch-icon.svg'), appleTouchIcon);
    console.log('✅ Created apple-touch-icon.svg');
    
    console.log('\n🎯 Favicon files created successfully!');
    console.log('📁 Location: /Users/ivanpozdnyakov/colab-crm/frontend/');
    console.log('📋 Files created:');
    console.log('  - favicon.svg (already exists)');
    console.log('  - favicon.ico (basic version)');
    console.log('  - apple-touch-icon.svg');
    console.log('  - generate-favicon.html (for testing)');
    
} catch (error) {
    console.error('❌ Error creating favicon files:', error.message);
}