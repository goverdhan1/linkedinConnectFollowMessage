const fs = require('fs');
const path = require('path');

const directoryPath = __dirname;

function extractLeadershipLines() {
  const filePath = path.join(directoryPath, 'merged.txt');
  if (!fs.existsSync(filePath)) {
    console.error('merged.txt not found');
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const results = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('Leadership')) {
      if (i + 1 < lines.length) {
        results.push(lines[i + 1].trim());
      }
    }
  }

  let output = '';
  if (results.length > 0) {
    output += `File: merged.txt\n`;
    results.forEach((line, idx) => {
      output += `${line}\n`;
    });
    output += '\n'; // blank line for separation
  }

  // Write the accumulated output to a text file
  fs.writeFileSync(path.join(directoryPath, 'leadership_data.txt'), output, 'utf8');
  console.log('Leadership data saved to leadership_data.txt');
}

extractLeadershipLines();
