// userAgentParser.js
// Utility to parse user-agent strings and extract device and browser information

// ua-parser-js is a CommonJS module, so we need to use createRequire for ES modules
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { UAParser } = require('ua-parser-js');

/**
 * Parse user-agent string to extract device type and browser name
 * @param {string} userAgent - The user-agent string from the request
 * @returns {Object} - { device: 'Desktop'|'Mobile'|'Tablet', browser: 'Chrome'|'Firefox'|'Safari'|'Edge'|etc. }
 */
export function parseUserAgent(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') {
    return {
      device: 'Desktop',
      browser: 'Unknown'
    };
  }

  try {
    const parser = new UAParser(userAgent);
    const deviceResult = parser.getDevice();
    const browserResult = parser.getBrowser();
    const osResult = parser.getOS();

    console.log(`[UserAgentParser] 📊 Parsed results:`, {
      device: deviceResult,
      browser: browserResult,
      os: osResult
    });

    // Determine device type
    let deviceType = 'Desktop'; // Default
    const deviceTypeRaw = deviceResult.type;
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

    // Get browser name with version
    const browserName = browserResult.name || 'Unknown';
    const browserVersion = browserResult.version ? ` ${browserResult.version.split('.')[0]}` : '';
    const browserFull = `${browserName}${browserVersion}`.trim();

    const result = {
      device: deviceType,
      browser: browserFull
    };
    
    console.log(`[UserAgentParser] ✅ Final result:`, result);
    return result;
  } catch (error) {
    console.error('Error parsing user-agent:', error);
    return {
      device: 'Desktop',
      browser: 'Unknown'
    };
  }
}

