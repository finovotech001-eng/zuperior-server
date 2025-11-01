/**
 * Converts a string to title case (capitalizes first letter of each word)
 * Example: "john doe" -> "John Doe", "MARY JANE" -> "Mary Jane"
 * @param {string} str - The string to convert
 * @returns {string} - Title-cased string
 */
export function toTitleCase(str) {
  if (!str || typeof str !== 'string') {
    return str;
  }
  
  return str
    .trim()
    .split(/\s+/)
    .map(word => {
      if (!word) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

