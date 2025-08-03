import Fuse from 'fuse.js';

class FuzzyMatcher {
  constructor() {
    this.fuseOptions = {
      includeScore: true,
      threshold: 0.1, // Much stricter threshold
      location: 0,
      distance: 50, // Reduced distance
      maxPatternLength: 200,
      minMatchCharLength: 15, // Increased minimum match length
      keys: ['text']
    };
  }

  findHighlights(content, filename, themes, contradictions) {
    const highlights = [];
    
    if (themes) {
      themes.forEach(theme => {
        const bestThemeMatch = this.findBestMatchForItem(content, filename, theme, 'theme');
        if (bestThemeMatch) {
          highlights.push(bestThemeMatch);
        }
      });
    }

    if (contradictions) {
      console.log(`Processing ${contradictions.length} contradictions for ${filename}`);
      contradictions.forEach((contradiction, index) => {
        console.log(`Contradiction ${index + 1}: ${contradiction.description}`);
        if (!contradiction.instances || !Array.isArray(contradiction.instances)) {
          console.warn(`Contradiction ${index + 1} has invalid instances:`, contradiction.instances);
          return;
        }
        
        const bestContradictionMatch = this.findBestMatchForItem(content, filename, contradiction, 'contradiction');
        if (bestContradictionMatch) {
          highlights.push(bestContradictionMatch);
        }
      });
    }

    console.log(`Highlights for ${filename}: ${highlights.length} total (${highlights.filter(h => h.type === 'theme').length} themes, ${highlights.filter(h => h.type === 'contradiction').length} contradictions)`);
    return highlights;
  }

  findBestMatchForItem(content, filename, item, type) {
    const candidates = [];
    const description = type === 'theme' ? item.theme : item.description;
    
    // Collect all possible matches for this item in this file
    item.instances.forEach(instance => {
      // Check source file matches
      if (instance.source_file === filename) {
        const position = this.findValidTextPosition(content, instance.source_phrase);
        if (position) {
          const quality = this.calculateMatchQuality(content, position, instance.source_phrase);
          if (quality > 0) { // Only add candidates with positive quality
            candidates.push({
              position,
              phrase: instance.source_phrase,
              quality,
              explanation: instance.explanation,
              targetFile: instance.target_files[0]?.target_file || null,
              targetPhrase: instance.target_files[0]?.target_phrase || null,
              isSource: true
            });
          }
        }
      }
      
      // Check target file matches
      if (instance.target_files && Array.isArray(instance.target_files)) {
        instance.target_files.forEach(target => {
          if (target.target_file === filename) {
            const position = this.findValidTextPosition(content, target.target_phrase);
            if (position) {
              const quality = this.calculateMatchQuality(content, position, target.target_phrase);
              if (quality > 0) { // Only add candidates with positive quality
                candidates.push({
                  position,
                  phrase: target.target_phrase,
                  quality,
                  explanation: instance.explanation,
                  targetFile: instance.source_file,
                  targetPhrase: instance.source_phrase,
                  isSource: false
                });
              }
            }
          }
        });
      }
    });

    // Find the best candidate
    if (candidates.length === 0) {
      console.log(`No valid candidates found for ${type} in ${filename}`);
      return null;
    }

    // Sort by quality (higher is better)
    candidates.sort((a, b) => b.quality - a.quality);
    const bestMatch = candidates[0];

    console.log(`Best ${type} match for ${filename}: "${bestMatch.phrase.substring(0, 50)}..." (quality: ${bestMatch.quality}) - Selected 1 of ${candidates.length} candidates`);

    return {
      start: bestMatch.position.start,
      end: bestMatch.position.end,
      type: type,
      explanation: bestMatch.explanation,
      description: description,
      id: `${type}-${filename}-${bestMatch.position.start}`,
      targetFile: bestMatch.targetFile,
      targetPhrase: bestMatch.targetPhrase
    };
  }

  findValidTextPosition(content, searchPhrase) {
    // Use the existing strict validation and text finding logic
    if (!searchPhrase || searchPhrase.trim().length < 10) {
      return null;
    }
    
    // Must contain multiple meaningful words (at least 2 characters each)
    const meaningfulWords = searchPhrase.split(/\s+/).filter(w => /^[a-zA-Z]{2,}$/.test(w.trim()));
    if (meaningfulWords.length < 2) {
      return null;
    }
    
    // Must contain substantial alphabetic content
    if (!/[a-zA-Z]{4,}/.test(searchPhrase)) {
      return null;
    }
    
    // Must not be mostly whitespace or punctuation
    const trimmedLength = searchPhrase.trim().length;
    const whitespaceRatio = (searchPhrase.length - trimmedLength) / searchPhrase.length;
    if (whitespaceRatio > 0.05 || /^[\s\W]*$/.test(searchPhrase)) {
      return null;
    }

    const position = this.findTextPosition(content, searchPhrase);
    if (position) {
      // Trim whitespace from the found position to only highlight actual words
      return this.trimHighlightToWords(content, position);
    }
    return null;
  }

  calculateMatchQuality(content, position, phrase) {
    const matchedText = content.substring(position.start, position.end);
    
    // IMMEDIATE DISQUALIFICATION for whitespace-heavy content
    const trimmedText = matchedText.trim();
    const whitespaceRatio = (matchedText.length - trimmedText.length) / matchedText.length;
    
    // Reject if more than 5% whitespace, no substantial words, or mostly punctuation
    if (whitespaceRatio > 0.05 || !/[a-zA-Z]{4,}/.test(matchedText) || /^\s*$/.test(matchedText) || /^[\s\W]*$/.test(matchedText)) {
      console.log('Match disqualified - too much whitespace, no words, or only punctuation:', matchedText);
      return 0; // Immediate rejection
    }
    
    // Additional check: ensure there are actual meaningful words (not just single characters)
    const meaningfulWords = matchedText.split(/\s+/).filter(word => /^[a-zA-Z]{2,}$/.test(word.trim()));
    if (meaningfulWords.length < 2) {
      console.log('Match disqualified - insufficient meaningful words:', matchedText);
      return 0; // Immediate rejection
    }
    
    let quality = 0;
    
    // Exact match gets highest score
    if (matchedText.toLowerCase() === phrase.toLowerCase()) {
      quality += 100;
    } else {
      // Partial scoring based on similarity
      const similarity = this.calculateSimilarity(matchedText.toLowerCase(), phrase.toLowerCase());
      quality += similarity * 90;
    }
    
    // Bonus for longer phrases (more specific)
    quality += Math.min(phrase.length / 10, 10);
    
    // Bonus for word count (more substantive)
    const wordCount = phrase.split(/\s+/).filter(w => w.length > 3).length;
    quality += wordCount * 5;
    
    // Bonus for high content density (non-whitespace)
    const contentRatio = trimmedText.length / matchedText.length;
    quality *= contentRatio;
    
    return quality;
  }

  calculateSimilarity(str1, str2) {
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    
    const distance = this.levenshteinDistance(str1, str2);
    return (maxLength - distance) / maxLength;
  }

  findInstanceHighlights(content, filename, instance, type, description) {
    const highlights = [];
    
    if (instance.source_file === filename) {
      // Much stricter validation for source phrase
      if (!instance.source_phrase || instance.source_phrase.trim().length < 10) {
        console.log(`Skipping ${type} with too short source phrase:`, instance.source_phrase);
        return highlights;
      }
      
      // Must contain multiple meaningful words
      const sourceWords = instance.source_phrase.split(/\s+/).filter(w => w.length > 3);
      if (sourceWords.length < 2) {
        console.log(`Skipping ${type} - source phrase needs at least 2 substantial words:`, instance.source_phrase);
        return highlights;
      }
      
      // Must contain substantial alphabetic content
      if (!/[a-zA-Z]{4,}/.test(instance.source_phrase)) {
        console.log(`Skipping ${type} with insufficient alphabetic content:`, instance.source_phrase);
        return highlights;
      }
      
      const position = this.findTextPosition(content, instance.source_phrase);
      if (position) {
        console.log(`Found ${type} highlight in ${filename}: "${instance.source_phrase}" at position ${position.start}-${position.end}`);
        highlights.push({
          start: position.start,
          end: position.end,
          type: type,
          explanation: instance.explanation,
          description: description,
          id: `${type}-${instance.source_file}-${position.start}`,
          targetFile: instance.target_files[0]?.target_file || null,
          targetPhrase: instance.target_files[0]?.target_phrase || null
        });
      } else {
        console.log(`Failed to find ${type} text in ${filename}: "${instance.source_phrase}"`);
      }
    }

    if (instance.target_files && Array.isArray(instance.target_files)) {
      instance.target_files.forEach(target => {
        if (target.target_file === filename) {
          // Much stricter validation for target phrase
          if (!target.target_phrase || target.target_phrase.trim().length < 10) {
            console.log(`Skipping ${type} with too short target phrase:`, target.target_phrase);
            return;
          }
          
          // Must contain multiple meaningful words  
          const targetWords = target.target_phrase.split(/\s+/).filter(w => w.length > 3);
          if (targetWords.length < 2) {
            console.log(`Skipping ${type} - target phrase needs at least 2 substantial words:`, target.target_phrase);
            return;
          }
          
          // Must contain substantial alphabetic content
          if (!/[a-zA-Z]{4,}/.test(target.target_phrase)) {
            console.log(`Skipping ${type} with insufficient alphabetic content in target:`, target.target_phrase);
            return;
          }
          
          const position = this.findTextPosition(content, target.target_phrase);
          if (position) {
            console.log(`Found ${type} target highlight in ${filename}: "${target.target_phrase}" at position ${position.start}-${position.end}`);
            highlights.push({
              start: position.start,
              end: position.end,
              type: type,
              explanation: instance.explanation,
              description: description,
              id: `${type}-${target.target_file}-${position.start}`,
              targetFile: instance.source_file,
              targetPhrase: instance.source_phrase
            });
          } else {
            console.log(`Failed to find ${type} target text in ${filename}: "${target.target_phrase}"`);
          }
        }
      });
    } else {
      console.warn(`Instance target_files is not an array or is missing:`, instance.target_files);
    }

    return highlights;
  }

  findTextPosition(content, searchPhrase) {
    if (!searchPhrase || searchPhrase.length === 0) {
      console.log('No search phrase provided');
      return null;
    }

    // Clean and validate search phrase - must contain actual words
    const cleanedPhrase = searchPhrase.trim();
    if (cleanedPhrase.length < 8) { // Increased minimum length
      console.log('Search phrase too short:', searchPhrase);
      return null;
    }

    // Ensure the phrase contains multiple meaningful words
    const words = cleanedPhrase.split(/\s+/).filter(w => w.length > 2);
    if (words.length < 2) { // Require at least 2 meaningful words
      console.log('Search phrase must contain at least 2 meaningful words:', searchPhrase);
      return null;
    }

    // Ensure the phrase contains substantial alphabetic content
    const hasActualWords = /[a-zA-Z]{4,}/.test(cleanedPhrase);
    if (!hasActualWords) {
      console.log('Search phrase contains no substantial words:', searchPhrase);
      return null;
    }

    // Normalize both content and search phrase to handle markdown formatting issues
    const normalizedContent = this.normalizeMarkdownText(content);
    const normalizedPhrase = this.normalizeMarkdownText(cleanedPhrase);

    // First try exact match on normalized content (case insensitive) - PRIORITY METHOD
    const lowerNormalizedContent = normalizedContent.toLowerCase();
    const lowerNormalizedPhrase = normalizedPhrase.toLowerCase();
    
    let normalizedIndex = lowerNormalizedContent.indexOf(lowerNormalizedPhrase);
    if (normalizedIndex !== -1) {
      // Map back to original content position
      const originalPosition = this.mapNormalizedToOriginal(content, normalizedContent, normalizedIndex, normalizedPhrase.length);
      if (originalPosition) {
        const matchedText = content.substring(originalPosition.start, originalPosition.end);
        
        // STRICT: Must be 98% non-whitespace and contain actual meaningful words
        const trimmedLength = matchedText.trim().length;
        const hasWords = /[a-zA-Z]{4,}/.test(matchedText);
        const isNotJustSpaces = !/^\s*$/.test(matchedText);
        const isNotOnlyPunctuation = !/^[\s\W]*$/.test(matchedText);
        const meaningfulWords = matchedText.split(/\s+/).filter(word => /^[a-zA-Z]{2,}$/.test(word.trim()));
        
        if (trimmedLength >= normalizedPhrase.length * 0.98 && hasWords && isNotJustSpaces && isNotOnlyPunctuation && meaningfulWords.length >= 2) {
          console.log('Found normalized exact match:', matchedText);
          return originalPosition;
        } else {
          console.log('Normalized match failed validation - mostly whitespace or no words:', matchedText);
        }
      }
    }

    // Fallback to original exact match method
    const lowerContent = content.toLowerCase();
    const lowerPhrase = cleanedPhrase.toLowerCase();
    
    let index = lowerContent.indexOf(lowerPhrase);
    if (index !== -1) {
      // Validate that the match is not just whitespace
      const matchedText = content.substring(index, index + cleanedPhrase.length);
      
      // STRICT: Must be 98% non-whitespace and contain actual meaningful words
      const trimmedLength = matchedText.trim().length;
      const hasWords = /[a-zA-Z]{4,}/.test(matchedText);
      const isNotJustSpaces = !/^\s*$/.test(matchedText);
      const isNotOnlyPunctuation = !/^[\s\W]*$/.test(matchedText);
      const meaningfulWords = matchedText.split(/\s+/).filter(word => /^[a-zA-Z]{2,}$/.test(word.trim()));
      
      if (trimmedLength >= cleanedPhrase.length * 0.98 && hasWords && isNotJustSpaces && isNotOnlyPunctuation && meaningfulWords.length >= 2) {
        console.log('Found exact match:', matchedText);
        return { 
          start: index, 
          end: index + cleanedPhrase.length 
        };
      } else {
        console.log('Exact match failed validation - mostly whitespace or no words:', matchedText);
      }
    }

    // Try exact match with normalized whitespace (different approach)
    const whitespaceNormalizedPhrase = cleanedPhrase.replace(/\s+/g, ' ');
    const whitespaceNormalizedContent = content.replace(/\s+/g, ' ');
    const whitespaceNormalizedIndex = whitespaceNormalizedContent.toLowerCase().indexOf(whitespaceNormalizedPhrase.toLowerCase());
    if (whitespaceNormalizedIndex !== -1) {
      const matchedText = whitespaceNormalizedContent.substring(whitespaceNormalizedIndex, whitespaceNormalizedIndex + whitespaceNormalizedPhrase.length);
      
      // STRICT: Same validation as exact match
      const trimmedLength = matchedText.trim().length;
      const hasWords = /[a-zA-Z]{4,}/.test(matchedText);
      const isNotJustSpaces = !/^\s*$/.test(matchedText);
      const isNotOnlyPunctuation = !/^[\s\W]*$/.test(matchedText);
      const meaningfulWords = matchedText.split(/\s+/).filter(word => /^[a-zA-Z]{2,}$/.test(word.trim()));
      
      if (trimmedLength >= whitespaceNormalizedPhrase.length * 0.98 && hasWords && isNotJustSpaces && isNotOnlyPunctuation && meaningfulWords.length >= 2) {
        console.log('Found whitespace-normalized exact match:', matchedText);
        return {
          start: whitespaceNormalizedIndex,
          end: whitespaceNormalizedIndex + whitespaceNormalizedPhrase.length
        };
      } else {
        console.log('Whitespace-normalized match failed validation - mostly whitespace or no words:', matchedText);
      }
    }
    
    // STRICT word sequence matching - only try if exact match failed
    const strictWords = cleanedPhrase.split(/\s+/).filter(w => w.length > 3 && /[a-zA-Z]{3,}/.test(w)); // Only substantial words
    
    if (strictWords.length < 2) {
      console.log('Insufficient meaningful words for matching:', searchPhrase);
      return null;
    }
    
    // Only try full phrase or nearly full phrase matches
    const minWordsRequired = Math.max(2, Math.floor(strictWords.length * 0.8)); // At least 80% of words must match
    
    for (let len = strictWords.length; len >= minWordsRequired; len--) {
      const phrase = strictWords.slice(0, len).join(' ');
      const phraseIndex = lowerContent.indexOf(phrase.toLowerCase());
      if (phraseIndex !== -1) {
        // Very strict validation - 98% must be meaningful content with actual words
        const matchedText = content.substring(phraseIndex, phraseIndex + phrase.length);
        const trimmedLength = matchedText.trim().length;
        const hasWords = /[a-zA-Z]{4,}/.test(matchedText);
        const isNotOnlyPunctuation = !/^[\s\W]*$/.test(matchedText);
        const meaningfulWords = matchedText.split(/\s+/).filter(word => /^[a-zA-Z]{2,}$/.test(word.trim()));
        
        if (trimmedLength >= phrase.length * 0.98 && hasWords && isNotOnlyPunctuation && meaningfulWords.length >= 2) {
          console.log('Found strict word sequence match:', matchedText);
          return {
            start: phraseIndex,
            end: phraseIndex + phrase.length
          };
        } else {
          console.log('Word sequence match failed content validation:', matchedText);
        }
      }
    }
    
    // NO MORE INDIVIDUAL WORD MATCHING - too permissive
    // NO MORE PUNCTUATION NORMALIZATION MATCHING - too permissive
    
    console.log('No exact or near-exact match found for phrase:', searchPhrase);
    return null;
  }

  findWordBoundaryMatch(content, phrase, startIndex) {
    // Check if the match starts and ends at word boundaries
    const beforeChar = startIndex > 0 ? content[startIndex - 1] : ' ';
    const afterChar = startIndex + phrase.length < content.length ? content[startIndex + phrase.length] : ' ';
    
    // Word boundary characters
    const wordBoundary = /[\s\.,;:!?()[\]{}"'`~\-]/;
    
    const startsAtBoundary = wordBoundary.test(beforeChar);
    const endsAtBoundary = wordBoundary.test(afterChar);
    
    // Prefer matches that start and end at word boundaries
    if (startsAtBoundary && endsAtBoundary) {
      return {
        start: startIndex,
        end: startIndex + phrase.length
      };
    }
    
    // If not perfect word boundary, try to extend to nearest word boundaries
    let adjustedStart = startIndex;
    let adjustedEnd = startIndex + phrase.length;
    
    // Find start of word
    while (adjustedStart > 0 && !wordBoundary.test(content[adjustedStart - 1])) {
      adjustedStart--;
    }
    
    // Find end of word  
    while (adjustedEnd < content.length && !wordBoundary.test(content[adjustedEnd])) {
      adjustedEnd++;
    }
    
    // Only extend if the extension is reasonable (less than 10 chars on each side)
    if (adjustedStart >= startIndex - 10 && adjustedEnd <= startIndex + phrase.length + 10) {
      return {
        start: adjustedStart,
        end: adjustedEnd
      };
    }
    
    return null;
  }

  normalizeText(text) {
    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();
  }

  normalizeMarkdownText(text) {
    return text
      // Normalize multiple spaces/tabs to single space
      .replace(/\s+/g, ' ')
      // Remove leading/trailing whitespace from lines
      .replace(/^\s+|\s+$/gm, '')
      // Normalize line breaks
      .replace(/\n+/g, '\n')
      // Trim overall
      .trim();
  }

  mapNormalizedToOriginal(originalContent, normalizedContent, normalizedIndex, matchLength) {
    // Simple character-by-character mapping approach
    let originalIndex = 0;
    let normalizedCount = 0;
    
    // Find start position
    while (normalizedCount < normalizedIndex && originalIndex < originalContent.length) {
      const originalChar = originalContent[originalIndex];
      const shouldInclude = this.shouldIncludeInNormalized(originalChar, originalIndex, originalContent);
      
      if (shouldInclude) {
        normalizedCount++;
      }
      originalIndex++;
    }
    
    const startIndex = originalIndex;
    
    // Find end position by looking for the match length in normalized space
    let endIndex = startIndex;
    let matchedLength = 0;
    
    while (matchedLength < matchLength && endIndex < originalContent.length) {
      const originalChar = originalContent[endIndex];
      const shouldInclude = this.shouldIncludeInNormalized(originalChar, endIndex, originalContent);
      
      if (shouldInclude) {
        matchedLength++;
      }
      endIndex++;
    }
    
    return {
      start: Math.max(0, startIndex - 1),
      end: Math.min(originalContent.length, endIndex)
    };
  }

  shouldIncludeInNormalized(char, index, content) {
    // Include all non-whitespace characters
    if (!/\s/.test(char)) {
      return true;
    }
    
    // Include single spaces between words
    if (char === ' ' || char === '\t') {
      const prevChar = index > 0 ? content[index - 1] : '';
      const nextChar = index < content.length - 1 ? content[index + 1] : '';
      
      // Include space if it's between non-whitespace characters
      return /\S/.test(prevChar) && /\S/.test(nextChar);
    }
    
    // Include newlines as single spaces
    if (char === '\n') {
      return true;
    }
    
    return false;
  }

  approximateMapPosition(original, normalized, normalizedIndex) {
    // Simple approximation based on character count
    if (normalizedIndex === 0) return 0;
    
    const normalizedBeforeIndex = normalized.substring(0, normalizedIndex);
    const ratio = normalizedBeforeIndex.length / normalized.length;
    const approximateOriginalIndex = Math.floor(ratio * original.length);
    
    // Search around the approximate position for better accuracy
    const searchWindow = 50;
    const startSearch = Math.max(0, approximateOriginalIndex - searchWindow);
    const endSearch = Math.min(original.length, approximateOriginalIndex + searchWindow);
    
    for (let i = startSearch; i < endSearch; i++) {
      if (i >= 0 && i < original.length) {
        return i;
      }
    }
    
    return approximateOriginalIndex;
  }

  levenshteinDistance(a, b) {
    const matrix = [];
    
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[b.length][a.length];
  }

  trimHighlightToWords(content, position) {
    const text = content.substring(position.start, position.end);
    let start = position.start;
    let end = position.end;
    
    // Find the first non-whitespace character
    let localStart = 0;
    while (localStart < text.length && /\s/.test(text[localStart])) {
      localStart++;
    }
    
    // Find the last non-whitespace character
    let localEnd = text.length - 1;
    while (localEnd >= 0 && /\s/.test(text[localEnd])) {
      localEnd--;
    }
    
    // Adjust positions
    start += localStart;
    end = start + (localEnd - localStart + 1);
    
    // Ensure we don't go beyond bounds
    start = Math.max(0, start);
    end = Math.min(content.length, end);
    
    return { start, end };
  }

  // No longer needed - we ensure only one highlight per theme/contradiction per file
}

export const fuzzyMatcher = new FuzzyMatcher();