const Cerebras = require('@cerebras/cerebras_cloud_sdk');
const fs = require('fs');
const path = require('path');

// Read API key from .env file
const envContent = fs.readFileSync('.env', 'utf-8');
const apiKey = envContent.split('=')[1].trim();

// Initialize Cerebras client
const client = new Cerebras({
  apiKey: apiKey,
});

// Define the JSON schema for structured output
const analysisSchema = {
  type: 'object',
  properties: {
    pass_metadata: {
      type: 'object',
      properties: {
        pass_number: { type: 'integer' },
        pass_type: { type: 'string' },
        items_extracted: { type: 'integer' },
        continuation_needed: { type: 'boolean' },
        areas_for_deeper_analysis: { 
          type: 'array',
          items: { type: 'string' }
        }
      },
      required: ['pass_number', 'pass_type', 'items_extracted', 'continuation_needed']
    },
    analysis_metadata: {
      type: 'object',
      properties: {
        files_analyzed: { type: 'integer' },
        total_comparisons_made: { type: 'integer' },
        extraction_completeness: { type: 'string' },
        total_themes_found: { type: 'integer' },
        total_contradictions_found: { type: 'integer' },
        average_themes_per_file: { type: 'number' },
        coverage_percentage: { type: 'number' }
      },
      required: ['files_analyzed', 'total_comparisons_made', 'extraction_completeness', 
                 'total_themes_found', 'total_contradictions_found']
    },
    common_themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          frequency_score: { type: 'number' },
          discovery_depth: { type: 'string' },
          instances: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source_file: { type: 'string' },
                source_phrase: { type: 'string' },
                target_files: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      target_file: { type: 'string' },
                      target_phrase: { type: 'string' },
                      similarity_score: { type: 'number' }
                    },
                    required: ['target_file', 'target_phrase']
                  }
                },
                explanation: { type: 'string' },
                context_before: { type: 'string' },
                context_after: { type: 'string' }
              },
              required: ['source_file', 'source_phrase', 'target_files', 'explanation']
            }
          }
        },
        required: ['theme', 'instances']
      }
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          instances: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                source_file: { type: 'string' },
                source_phrase: { type: 'string' },
                target_files: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      target_file: { type: 'string' },
                      target_phrase: { type: 'string' },
                      conflict_type: { type: 'string' }
                    },
                    required: ['target_file', 'target_phrase']
                  }
                },
                explanation: { type: 'string' }
              },
              required: ['source_file', 'source_phrase', 'target_files', 'explanation']
            }
          }
        },
        required: ['description', 'instances']
      }
    },
    extraction_summary: {
      type: 'object',
      properties: {
        files_with_most_connections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              connection_count: { type: 'integer' }
            },
            required: ['filename', 'connection_count']
          }
        },
        unique_concepts_per_file: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              filename: { type: 'string' },
              unique_concept_count: { type: 'integer' }
            },
            required: ['filename', 'unique_concept_count']
          }
        },
        unexplored_areas: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    }
  },
  required: ['pass_metadata', 'analysis_metadata', 'common_themes', 'contradictions']
};

// Function to read all markdown files
function readMarkdownFiles(directory) {
  const files = fs.readdirSync(directory);
  const markdownFiles = files.filter(file => path.extname(file) === '.md');
  const fileContents = {};
  
  markdownFiles.forEach(file => {
    const filePath = path.join(directory, file);
    fileContents[file] = fs.readFileSync(filePath, 'utf-8');
  });
  
  return fileContents;
}

// Function to calculate dynamic extraction parameters
function calculateExtractionParams(fileContents, passNumber = 1) {
  const fileCount = Object.keys(fileContents).length;
  const totalContent = Object.values(fileContents).join('').length;
  const avgLength = totalContent / fileCount;
  
  // Calculate complexity score based on content characteristics
  const complexityFactors = {
    fileCount: fileCount,
    avgFileLength: avgLength,
    totalContentLength: totalContent,
    estimatedConcepts: Math.ceil(totalContent / 100), // Rough estimate
    potentialComparisons: (fileCount * (fileCount - 1)) / 2
  };
  
  // Determine number of passes needed
  const passesNeeded = Math.max(
    3, // Minimum 3 passes
    Math.ceil(Math.log2(fileCount) * 2), // Scale with file count
    Math.ceil(complexityFactors.estimatedConcepts / 50) // Scale with concept density
  );
  
  // Items to extract per pass (increases with each pass)
  const itemsPerPass = Math.ceil(
    complexityFactors.estimatedConcepts / passesNeeded * (1 + passNumber * 0.5)
  );
  
  return {
    ...complexityFactors,
    passesNeeded,
    itemsPerPass,
    currentPassFocus: getPassFocus(passNumber),
    minItemsThisPass: itemsPerPass,
    maxItemsThisPass: itemsPerPass * 3
  };
}

// Define focus areas for each pass
function getPassFocus(passNumber) {
  const passFocuses = [
    {
      type: 'broad_themes',
      description: 'High-level conceptual themes and major architectural patterns',
      granularity: 'macro',
      depth: 'surface'
    },
    {
      type: 'technical_details',
      description: 'Technical specifications, APIs, implementation details',
      granularity: 'micro',
      depth: 'medium'
    },
    {
      type: 'edge_cases',
      description: 'Subtle relationships, edge cases, implicit connections',
      granularity: 'micro',
      depth: 'deep'
    },
    {
      type: 'cross_references',
      description: 'Inter-document dependencies and evolutionary patterns',
      granularity: 'macro',
      depth: 'deep'
    },
    {
      type: 'semantic_variants',
      description: 'Semantic equivalences, terminology variations, implied meanings',
      granularity: 'micro',
      depth: 'deep'
    },
    {
      type: 'contextual_analysis',
      description: 'Context-dependent meanings and conditional relationships',
      granularity: 'micro',
      depth: 'exhaustive'
    },
    {
      type: 'meta_patterns',
      description: 'Patterns of patterns, higher-order relationships',
      granularity: 'meta',
      depth: 'exhaustive'
    },
    {
      type: 'residual_extraction',
      description: 'Any remaining unextracted relationships',
      granularity: 'all',
      depth: 'exhaustive'
    }
  ];
  
  return passFocuses[Math.min(passNumber - 1, passFocuses.length - 1)];
}

// Generate pass-specific prompt
function generatePassPrompt(fileContents, passNumber, previousResults, params) {
  const fileNames = Object.keys(fileContents);
  const passFocus = params.currentPassFocus;
  
  // Build context from previous passes
  let previousContext = '';
  if (previousResults && previousResults.length > 0) {
    const totalPreviousThemes = previousResults.reduce((sum, r) => sum + r.common_themes.length, 0);
    const totalPreviousContradictions = previousResults.reduce((sum, r) => sum + r.contradictions.length, 0);
    const exploredAreas = previousResults.map(r => r.pass_metadata.pass_type).join(', ');
    
    previousContext = `
    PREVIOUS EXTRACTION CONTEXT:
    - Passes completed: ${previousResults.length}
    - Total themes already found: ${totalPreviousThemes}
    - Total contradictions already found: ${totalPreviousContradictions}
    - Areas already explored: ${exploredAreas}
    
    CRITICAL: You must find NEW themes and contradictions not covered in previous passes.
    Previous themes to AVOID repeating:
    ${previousResults.flatMap(r => r.common_themes.map(t => `- ${t.theme}`)).slice(0, 20).join('\n')}
    
    Focus on UNEXPLORED areas and DEEPER relationships.
    `;
  }
  
  return `
    MULTI-PASS EXTRACTION - PASS ${passNumber} of ${params.passesNeeded}
    
    CURRENT PASS FOCUS: ${passFocus.type.toUpperCase()}
    Description: ${passFocus.description}
    Granularity: ${passFocus.granularity}
    Analysis Depth: ${passFocus.depth}
    
    ${previousContext}
    
    EXTRACTION REQUIREMENTS FOR THIS PASS:
    - MINIMUM items to extract: ${params.minItemsThisPass}
    - MAXIMUM items to extract: ${params.maxItemsThisPass}
    - Do NOT stop until minimum is reached
    - Continue extracting until maximum if content permits
    
    PASS-SPECIFIC INSTRUCTIONS:
    
    ${getPassSpecificInstructions(passFocus, passNumber, params)}
    
    EXTRACTION METHODOLOGY FOR PASS ${passNumber}:
    
    1. ${passFocus.type === 'broad_themes' ? 'BROAD SCANNING' : 'DEEP DIVING'}:
       ${getMethodologyForPass(passFocus)}
    
    2. RELATIONSHIP DISCOVERY:
       - ${passFocus.granularity === 'macro' ? 'Focus on high-level patterns' : 'Extract fine-grained details'}
       - ${passFocus.depth === 'deep' ? 'Analyze implicit and hidden connections' : 'Identify explicit relationships'}
       - Look for ${getRelationshipTypes(passFocus)}
    
    3. EXTRACTION TARGETS:
       ${getExtractionTargets(passFocus, params)}
    
    4. QUALITY REQUIREMENTS:
       - Every extraction must include context_before and context_after (10-20 words each)
       - Similarity scores (0-1) for theme relationships
       - Conflict types for contradictions
       - Discovery depth: "${passFocus.depth}"
    
    5. CONTINUATION SIGNALS:
       Set continuation_needed to true if:
       - You identify areas requiring deeper analysis
       - Unexplored concept clusters remain
       - Pattern complexity exceeds current pass scope
       - You've reached maximum items but more exist
    
    DYNAMIC SCALING FORMULA:
    - Base extraction: ${params.estimatedConcepts} estimated concepts
    - Pass multiplier: ${1 + passNumber * 0.5}x for pass ${passNumber}
    - Target output: ${params.minItemsThisPass} to ${params.maxItemsThisPass} items
    - If content is dense, lean toward maximum
    - If relationships are complex, extract more
    
    AREAS FOR DEEPER ANALYSIS:
    Identify and list specific areas that need exploration in future passes:
    - Unexplored concept clusters
    - Complex relationship networks
    - Ambiguous connections
    - Terminology requiring semantic analysis
    - Cross-file dependencies
    
    Files to analyze (${fileNames.length} files, ${params.totalContentLength} total characters):
    ${fileNames.map(name => `
    ========================================
    File: ${name}
    Length: ${fileContents[name].length} characters
    Content:
    ${fileContents[name]}
    ========================================
    `).join('')}
    
    REMEMBER: 
    - Pass ${passNumber} of ${params.passesNeeded}
    - Focus: ${passFocus.type}
    - Minimum output: ${params.minItemsThisPass} items
    - This is ${passNumber === params.passesNeeded ? 'the FINAL' : 'an INTERMEDIATE'} pass
    ${passNumber === params.passesNeeded ? '- Extract EVERYTHING remaining' : '- Save some depth for later passes'}
  `;
}

// Get pass-specific detailed instructions
function getPassSpecificInstructions(passFocus, passNumber, params) {
  const instructions = {
    'broad_themes': `
      - Identify overarching architectural patterns
      - Extract high-level design principles
      - Find common methodologies across files
      - Look for shared goals and objectives
      - Identify technology stacks and frameworks`,
    
    'technical_details': `
      - Extract specific API endpoints and parameters
      - Identify data structures and schemas
      - Find configuration settings and values
      - Extract algorithm implementations
      - Identify specific version numbers and dependencies`,
    
    'edge_cases': `
      - Find subtle contradictions in approach
      - Identify implicit assumptions
      - Extract boundary conditions
      - Find mentioned-but-not-explained concepts
      - Identify potential conflict points`,
    
    'cross_references': `
      - Map document-to-document dependencies
      - Identify temporal evolution of concepts
      - Find references to external systems
      - Extract prerequisite relationships
      - Identify circular dependencies`,
    
    'semantic_variants': `
      - Find ALL ways the same concept is expressed
      - Identify abbreviations and their full forms
      - Extract synonymous technical terms
      - Find informal vs formal terminology
      - Identify context-dependent meanings`,
    
    'contextual_analysis': `
      - Extract conditional relationships (if X then Y)
      - Find context-dependent behaviors
      - Identify environmental dependencies
      - Extract state-dependent patterns
      - Find temporal conditions`,
    
    'meta_patterns': `
      - Identify patterns in how concepts are organized
      - Find recurring structural patterns
      - Extract meta-level design decisions
      - Identify systematic biases or preferences
      - Find emergent properties from combinations`,
    
    'residual_extraction': `
      - Extract EVERYTHING not yet captured
      - Find the most obscure relationships
      - Identify single-mention concepts
      - Extract partial or incomplete ideas
      - Capture any remaining value`
  };
  
  return instructions[passFocus.type] || instructions['residual_extraction'];
}

// Get methodology for specific pass type
function getMethodologyForPass(passFocus) {
  const methodologies = {
    'broad_themes': 'Scan all files for recurring high-level concepts, architectures, and design patterns',
    'technical_details': 'Deep-dive into implementation specifics, code patterns, and technical specifications',
    'edge_cases': 'Analyze boundaries, exceptions, and special cases mentioned in the documents',
    'cross_references': 'Map how documents reference and depend on each other',
    'semantic_variants': 'Identify all variations in terminology and expression of concepts',
    'contextual_analysis': 'Analyze how context changes meaning and relationships',
    'meta_patterns': 'Identify patterns in the patterns themselves',
    'residual_extraction': 'Exhaustively extract any remaining unanalyzed content'
  };
  
  return methodologies[passFocus.type] || methodologies['residual_extraction'];
}

// Get relationship types to look for
function getRelationshipTypes(passFocus) {
  const relationshipTypes = {
    'macro': 'architectural similarities, design pattern matches, strategic alignments',
    'micro': 'parameter matches, value correspondences, specific implementation details',
    'meta': 'patterns of patterns, systematic approaches, organizational principles'
  };
  
  return relationshipTypes[passFocus.granularity] || 'all relationship types';
}

// Get extraction targets
function getExtractionTargets(passFocus, params) {
  return `
  - Target ${params.minItemsThisPass} minimum theme extractions
  - Target ${Math.ceil(params.minItemsThisPass * 0.3)} minimum contradiction extractions
  - Include context snippets for every extraction
  - Add similarity/conflict scores to quantify relationships
  - Flag areas needing deeper analysis in next pass
  `;
}

// Function to perform a single analysis pass
async function performAnalysisPass(fileContents, passNumber, previousResults = null) {
  const params = calculateExtractionParams(fileContents, passNumber);
  const prompt = generatePassPrompt(fileContents, passNumber, previousResults, params);
  
  try {
    console.log(`\nExecuting Pass ${passNumber}/${params.passesNeeded}`);
    console.log(`Focus: ${params.currentPassFocus.type}`);
    console.log(`Target extractions: ${params.minItemsThisPass}-${params.maxItemsThisPass}`);
    
    const response = await client.chat.completions.create({
      messages: [
        { 
          role: "system", 
          content: `You are an expert document analyzer performing pass ${passNumber} of a multi-pass extraction. 
                   You must extract between ${params.minItemsThisPass} and ${params.maxItemsThisPass} items in this pass.
                   Focus on ${params.currentPassFocus.type}: ${params.currentPassFocus.description}`
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      // model: "llama-4-scout-17b-16e-instruct",
      model: "qwen-3-32b",
      max_tokens: 100000,
      temperature: 0.3 + (passNumber * 0.05), // Slightly increase temperature for later passes
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'file_analysis_schema',
          strict: true,
          schema: analysisSchema
        }
      }
    });
    
    if (!response || !response.choices || !response.choices[0] || !response.choices[0].message) {
      throw new Error('Invalid API response structure');
    }
    
    const responseContent = response.choices[0].message.content;
    console.log('Raw API response:', responseContent.substring(0, 500) + '...');
    
    const result = JSON.parse(responseContent);
    
    // Validate the result has required structure
    if (!result.pass_metadata || !result.common_themes || !result.contradictions) {
      console.log('Response structure:', Object.keys(result));
      throw new Error('Invalid response format: missing required fields');
    }
    
    return result;
  } catch (error) {
    console.error(`Error in pass ${passNumber}:`, error);
    
    // Return a fallback result structure to prevent undefined errors
    return {
      pass_metadata: {
        pass_number: passNumber,
        pass_type: params.currentPassFocus.type,
        items_extracted: 0,
        continuation_needed: false,
        areas_for_deeper_analysis: []
      },
      analysis_metadata: {
        files_analyzed: Object.keys(fileContents).length,
        total_comparisons_made: 0,
        extraction_completeness: 'failed',
        total_themes_found: 0,
        total_contradictions_found: 0,
        average_themes_per_file: 0,
        coverage_percentage: 0
      },
      common_themes: [],
      contradictions: [],
      extraction_summary: {
        files_with_most_connections: [],
        unique_concepts_per_file: [],
        unexplored_areas: [`Error in pass ${passNumber}: ${error.message}`]
      }
    };
  }
}

// Function to merge results from multiple passes
function mergeAnalysisResults(allResults) {
  const merged = {
    analysis_metadata: {
      files_analyzed: allResults[0].analysis_metadata.files_analyzed,
      total_comparisons_made: 0,
      extraction_completeness: 'exhaustive_multi_pass',
      total_themes_found: 0,
      total_contradictions_found: 0,
      average_themes_per_file: 0,
      coverage_percentage: 100,
      total_passes: allResults.length
    },
    common_themes: [],
    contradictions: [],
    extraction_summary: {
      files_with_most_connections: [],
      unique_concepts_per_file: [],
      passes_performed: []
    }
  };
  
  // Merge themes and contradictions from all passes
  allResults.forEach((result, index) => {
    merged.common_themes.push(...result.common_themes);
    merged.contradictions.push(...result.contradictions);
    merged.analysis_metadata.total_comparisons_made += result.analysis_metadata.total_comparisons_made;
    
    merged.extraction_summary.passes_performed.push({
      pass_number: index + 1,
      pass_type: result.pass_metadata.pass_type,
      items_extracted: result.pass_metadata.items_extracted,
      themes_found: result.common_themes.length,
      contradictions_found: result.contradictions.length
    });
  });
  
  // Update totals
  merged.analysis_metadata.total_themes_found = merged.common_themes.length;
  merged.analysis_metadata.total_contradictions_found = merged.contradictions.length;
  merged.analysis_metadata.average_themes_per_file = 
    merged.common_themes.length / merged.analysis_metadata.files_analyzed;
  
  // Deduplicate themes (keep the one with more detail)
  merged.common_themes = deduplicateThemes(merged.common_themes);
  merged.contradictions = deduplicateContradictions(merged.contradictions);
  
  // Calculate file connection summary
  merged.extraction_summary.files_with_most_connections = calculateFileConnections(merged);
  merged.extraction_summary.unique_concepts_per_file = 
    allResults[0].extraction_summary?.unique_concepts_per_file || [];
  
  return merged;
}

// Deduplicate themes while keeping the most detailed version
function deduplicateThemes(themes) {
  const themeMap = new Map();
  
  themes.forEach(theme => {
    const key = theme.theme.toLowerCase();
    if (!themeMap.has(key) || theme.instances.length > themeMap.get(key).instances.length) {
      themeMap.set(key, theme);
    }
  });
  
  return Array.from(themeMap.values());
}

// Deduplicate contradictions
function deduplicateContradictions(contradictions) {
  const contradictionMap = new Map();
  
  contradictions.forEach(contradiction => {
    const key = contradiction.description.toLowerCase();
    if (!contradictionMap.has(key) || 
        contradiction.instances.length > contradictionMap.get(key).instances.length) {
      contradictionMap.set(key, contradiction);
    }
  });
  
  return Array.from(contradictionMap.values());
}

// Calculate which files have the most connections
function calculateFileConnections(merged) {
  const fileConnections = {};
  
  // Count connections from themes
  merged.common_themes.forEach(theme => {
    theme.instances.forEach(instance => {
      fileConnections[instance.source_file] = (fileConnections[instance.source_file] || 0) + 1;
      instance.target_files.forEach(target => {
        fileConnections[target.target_file] = (fileConnections[target.target_file] || 0) + 1;
      });
    });
  });
  
  // Count connections from contradictions
  merged.contradictions.forEach(contradiction => {
    contradiction.instances.forEach(instance => {
      fileConnections[instance.source_file] = (fileConnections[instance.source_file] || 0) + 1;
      instance.target_files.forEach(target => {
        fileConnections[target.target_file] = (fileConnections[target.target_file] || 0) + 1;
      });
    });
  });
  
  // Sort and return top files
  return Object.entries(fileConnections)
    .map(([filename, connection_count]) => ({ filename, connection_count }))
    .sort((a, b) => b.connection_count - a.connection_count)
    .slice(0, 5);
}

// Main function with multi-pass orchestration
async function main() {
  try {
    console.log("=== Starting Multi-Pass Exhaustive Analysis ===");
    
    // Read markdown files from current directory (session directory)
    const fileContents = readMarkdownFiles('.');
    const fileCount = Object.keys(fileContents).length;
    
    console.log(`Found ${fileCount} markdown files to analyze`);
    
    // Calculate how many passes we need
    const params = calculateExtractionParams(fileContents, 1);
    const totalPasses = params.passesNeeded;
    
    console.log(`Calculated extraction parameters:`);
    console.log(`- Estimated concepts: ${params.estimatedConcepts}`);
    console.log(`- Planned passes: ${totalPasses}`);
    console.log(`- Expected total extractions: ${params.estimatedConcepts * 2}+`);
    
    // Perform multiple passes
    const allResults = [];
    let continueExtraction = true;
    let passNumber = 1;
    
    while (continueExtraction && passNumber <= totalPasses) {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Starting Pass ${passNumber} of ${totalPasses}`);
      console.log(`${'='.repeat(50)}`);
      
      const passResult = await performAnalysisPass(
        fileContents, 
        passNumber, 
        allResults.length > 0 ? allResults : null
      );
      
      // Save individual pass result
      fs.writeFileSync(
        `pass_${passNumber}_results.json`, 
        JSON.stringify(passResult, null, 2)
      );
      
      allResults.push(passResult);
      
      console.log(`Pass ${passNumber} complete:`);
      console.log(`- Themes found: ${passResult.common_themes.length}`);
      console.log(`- Contradictions found: ${passResult.contradictions.length}`);
      console.log(`- Total items: ${passResult.pass_metadata.items_extracted}`);
      console.log(`- Continuation needed: ${passResult.pass_metadata.continuation_needed}`);
      
      // Check if we should continue
      if (!passResult.pass_metadata.continuation_needed && passNumber >= 3) {
        console.log(`\nAnalysis complete after ${passNumber} passes (no more content to extract)`);
        continueExtraction = false;
      } else if (passNumber >= totalPasses) {
        console.log(`\nReached maximum planned passes (${totalPasses})`);
        continueExtraction = false;
      } else {
        passNumber++;
        // Small delay between passes to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Merge all results
    console.log(`\n${'='.repeat(50)}`);
    console.log("Merging results from all passes...");
    const mergedResults = mergeAnalysisResults(allResults);
    
    // Write final merged results
    fs.writeFileSync('ai_file_analysis_complete.json', JSON.stringify(mergedResults, null, 2));
    
    // Write summary report
    const summaryReport = {
      execution_summary: {
        total_passes_executed: allResults.length,
        total_themes_extracted: mergedResults.analysis_metadata.total_themes_found,
        total_contradictions_found: mergedResults.analysis_metadata.total_contradictions_found,
        total_comparisons_made: mergedResults.analysis_metadata.total_comparisons_made,
        average_items_per_pass: Math.round(
          (mergedResults.analysis_metadata.total_themes_found + 
           mergedResults.analysis_metadata.total_contradictions_found) / allResults.length
        ),
        files_analyzed: fileCount
      },
      pass_breakdown: allResults.map((r, i) => ({
        pass: i + 1,
        type: r.pass_metadata.pass_type,
        themes: r.common_themes.length,
        contradictions: r.contradictions.length,
        total: r.pass_metadata.items_extracted
      })),
      top_connected_files: mergedResults.extraction_summary.files_with_most_connections
    };
    
    fs.writeFileSync('analysis_summary.json', JSON.stringify(summaryReport, null, 2));
    
    // Print final summary
    console.log(`\n${'='.repeat(50)}`);
    console.log("=== ANALYSIS COMPLETE ===");
    console.log(`${'='.repeat(50)}`);
    console.log(`Total passes executed: ${allResults.length}`);
    console.log(`Total themes found: ${mergedResults.analysis_metadata.total_themes_found}`);
    console.log(`Total contradictions: ${mergedResults.analysis_metadata.total_contradictions_found}`);
    console.log(`Total items extracted: ${mergedResults.analysis_metadata.total_themes_found + mergedResults.analysis_metadata.total_contradictions_found}`);
    console.log(`Average themes per file: ${mergedResults.analysis_metadata.average_themes_per_file.toFixed(2)}`);
    console.log(`\nFiles saved:`);
    console.log(`- Complete merged analysis: ai_file_analysis_complete.json`);
    console.log(`- Summary report: analysis_summary.json`);
    console.log(`- Individual pass results: pass_1_results.json ... pass_${allResults.length}_results.json`);
    
  } catch (error) {
    console.error("Error during analysis:", error);
    process.exit(1);
  }
}

main();