// userAgentParser.js
// Utility to parse user-agent strings and extract device and browser information

const UAParser = require('ua-parser-js');

/**
 * Parse user-agent string to extract device type and browser name
 * @param {string} userAgent - The user-agent string from the request
 * @returns {Object} - { device: 'Desktop'|'Mobile'|'Tablet', browser: 'Chrome'|'Firefox'|'Safari'|'Edge'|etc. }
 */
function parseUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return {
      device: 'Desktop',
      browser: 'Unknown'
    };
  }

  try {
    const parser = new UAParser(userAgent);
    const device = parser.getDevice();
    const browser = parser.getBrowser();

    // Determine device type
    let deviceType = 'Desktop'; // Default
    const deviceTypeRaw = device.type;
    if (deviceTypeRaw) {
      const deviceTypeLower = deviceTypeRaw.toLowerCase();
      if (deviceTypeLower === 'mobile') {
        deviceType = 'Mobile';
      } else if (deviceTypeLower === 'tablet') {
        deviceType = 'Tablet';
      } else {
        deviceType = 'Desktop';
      }
    } else {
      // If device type is not detected, try to infer from user-agent
      const uaLower = userAgent.toLowerCase();
      if (uaLower.includes('mobile') || uaLower.includes('android') || uaLower.includes('iphone')) {
        deviceType = 'Mobile';
      } else if (uaLower.includes('tablet') || uaLower.includes('ipad')) {
        deviceType = 'Tablet';
      }
    }

    // Get browser name
    const browserName = browser.name || 'Unknown';

    return {
      device: deviceType,
      browser: browserName
    };
  } catch (error) {
    console.error('Error parsing user-agent:', error);
    return {
      device: 'Desktop',
      browser: 'Unknown'
    };
  }
}

module.exports = {
  parseUserAgent
};

