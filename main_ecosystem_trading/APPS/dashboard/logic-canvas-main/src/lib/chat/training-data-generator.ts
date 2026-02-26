/**
 * Training Data Generator from .set Files
 * 
 * Parses the actual MT4 configuration files to generate
 * comprehensive training examples for the NLU model.
 * 
 * This extracts: field names, value patterns, group/logic patterns,
 * and generates all possible command variations.
 */

import * as fs from 'fs';
import * as path from 'path';

interface SetField {
  fullName: string;    // gInput_10_AC_Buy_Grid
  group: number;       // 10
  logic: string;       // AC_Buy
  field: string;       // Grid
  value: string;       // 1045.0
  valueType: 'number' | 'boolean' | 'string';
}

/**
 * Parse a .set.keymap.json file and extract all fields
 */
export function parseSetKeymap(filePath: string): SetField[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(content);
  
  const fields: SetField[] = [];
  
  // Pattern: gInput_{group}_{logic}_{field}
  const pattern = /^gInput_(\d+)_(.+?)_(.+)$/;
  
  for (const [key, value] of Object.entries(data)) {
    const match = key.match(pattern);
    if (match) {
      const [, group, logic, field] = match;
      const strValue = String(value);
      
      // Determine value type
      let valueType: 'number' | 'boolean' | 'string' = 'number';
      if (strValue === '0' || strValue === '1') {
        valueType = 'boolean';
      } else if (isNaN(Number(strValue))) {
        valueType = 'string';
      }
      
      fields.push({
        fullName: key,
        group: parseInt(group),
        logic,
        field,
        value: strValue,
        valueType
      });
    }
  }
  
  return fields;
}

/**
 * Extract unique field names and their typical values
 */
export function extractFieldMetadata(fields: SetField[]): Map<string, { typicalValues: string[], isBoolean: boolean }> {
  const fieldMap = new Map<string, Set<string>>();
  
  for (const field of fields) {
    if (!fieldMap.has(field.field)) {
      fieldMap.set(field.field, new Set());
    }
    fieldMap.get(field.field)!.add(field.value);
  }
  
  const metadata = new Map<string, { typicalValues: string[], isBoolean: boolean }>();
  
  for (const [field, values] of fieldMap) {
    const valueArray = Array.from(values);
    const isBoolean = valueArray.every(v => v === '0' || v === '1');
    
    // Get top 10 most common values
    const counts = new Map<string, number>();
    for (const v of valueArray) {
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([v]) => v);
    
    metadata.set(field, {
      typicalValues: sorted,
      isBoolean
    });
  }
  
  return metadata;
}

/**
 * Generate training examples from parsed fields
 */
export function generateTrainingExamples(fields: SetField[]): {
  text: string;
  intent: string;
  extractedField?: string;
  extractedValue?: string;
}[] {
  const examples: { text: string, intent: string, extractedField?: string, extractedValue?: string }[] = [];
  
  // Get unique fields
  const fieldMetadata = extractFieldMetadata(fields);
  
  // GENERATE SET EXAMPLES
  for (const [field, meta] of fieldMetadata) {
    const fieldLower = field.toLowerCase();
    const fieldSnake = field.replace(/([A-Z])/g, '_$1').toLowerCase();
    
    for (const value of meta.typicalValues.slice(0, 5)) {
      // Pattern: "set {field} to {value}"
      examples.push({
        text: `set ${fieldSnake} to ${value}`,
        intent: 'SET',
        extractedField: field,
        extractedValue: value
      });
      
      // Pattern: "{field} {value}"
      examples.push({
        text: `${fieldSnake} ${value}`,
        intent: 'SET',
        extractedField: field,
        extractedValue: value
      });
      
      // Pattern: "change {field} to {value}"
      examples.push({
        text: `change ${fieldSnake} to ${value}`,
        intent: 'SET',
        extractedField: field,
        extractedValue: value
      });
      
      // For boolean fields
      if (meta.isBoolean) {
        if (value === '0' || value === '1') {
          const readable = value === '0' ? 'off' : 'on';
          examples.push({
            text: `set ${fieldSnake} ${readable}`,
            intent: 'SET',
            extractedField: field,
            extractedValue: value
          });
          
          examples.push({
            text: `turn ${fieldSnake} ${readable}`,
            intent: 'SET',
            extractedField: field,
            extractedValue: value
          });
          
          examples.push({
            text: `${readable} ${fieldSnake}`,
            intent: 'SET',
            extractedField: field,
            extractedValue: value
          });
        }
      }
    }
  }
  
  // GENERATE GROUP-SPECIFIC EXAMPLES
  const groups = [...new Set(fields.map(f => f.group))].sort((a, b) => a - b);
  for (const group of groups) {
    examples.push({
      text: `show group ${group}`,
      intent: 'QUERY'
    });
    
    examples.push({
      text: `set grid to 500 for group ${group}`,
      intent: 'SET'
    });
    
    examples.push({
      text: `change group ${group} multiplier to 1.5`,
      intent: 'SET'
    });
  }
  
  // GENERATE RANGE EXAMPLES
  examples.push({
    text: 'groups 1-8',
    intent: 'QUERY'
  });
  
  examples.push({
    text: 'set grid to 600 for groups 1-8',
    intent: 'SET'
  });
  
  // GENERATE SEMANTIC EXAMPLES
  const semanticPatterns = [
    { text: 'make it more aggressive', intent: 'SEMANTIC' },
    { text: 'make it safer', intent: 'SEMANTIC' },
    { text: 'more aggressive', intent: 'SEMANTIC' },
    { text: 'more conservative', intent: 'SEMANTIC' },
    { text: 'increase risk', intent: 'SEMANTIC' },
    { text: 'decrease risk', intent: 'SEMANTIC' },
    { text: 'be more aggressive', intent: 'SEMANTIC' },
    { text: 'be safer', intent: 'SEMANTIC' },
  ];
  examples.push(...semanticPatterns);
  
  // GENERATE QUERY EXAMPLES
  const queryPatterns = [
    { text: 'show grid values', intent: 'QUERY' },
    { text: 'what is the grid', intent: 'QUERY' },
    { text: 'show all values', intent: 'QUERY' },
    { text: 'list configurations', intent: 'QUERY' },
    { text: 'show settings', intent: 'QUERY' },
    { text: 'what multiplier is used', intent: 'QUERY' },
  ];
  examples.push(...queryPatterns);
  
  // GENERATE COPY EXAMPLES
  const copyPatterns = [
    { text: 'copy group 1 to 5', intent: 'COPY' },
    { text: 'clone settings', intent: 'COPY' },
    { text: 'copy from group 3', intent: 'COPY' },
    { text: 'duplicate group 2', intent: 'COPY' },
  ];
  examples.push(...copyPatterns);
  
  // GENERATE COMPARE EXAMPLES
  const comparePatterns = [
    { text: 'compare group 1 and 5', intent: 'COMPARE' },
    { text: 'show differences', intent: 'COMPARE' },
    { text: 'compare settings', intent: 'COMPARE' },
    { text: 'what is different', intent: 'COMPARE' },
  ];
  examples.push(...comparePatterns);
  
  // GENERATE RESET EXAMPLES
  const resetPatterns = [
    { text: 'reset group 3', intent: 'RESET' },
    { text: 'restore defaults', intent: 'RESET' },
    { text: 'reset all', intent: 'RESET' },
    { text: 'go back to default', intent: 'RESET' },
  ];
  examples.push(...resetPatterns);
  
  // GENERATE PROGRESSION EXAMPLES
  const progressionPatterns = [
    { text: 'fibonacci progression', intent: 'PROGRESSION' },
    { text: 'linear from 500 to 2000', intent: 'PROGRESSION' },
    { text: 'exponential grid', intent: 'PROGRESSION' },
    { text: 'martingale sequence', intent: 'PROGRESSION' },
    { text: 'scale from 300 to 1000', intent: 'PROGRESSION' },
  ];
  examples.push(...progressionPatterns);
  
  return examples;
}

/**
 * Main execution - generate training data from .set files
 */
export function generateFromSetFiles(dashSetsPath: string): {
  examples: { text: string, intent: string }[];
  fieldMetadata: Record<string, { typicalValues: string[], isBoolean: boolean }>;
} {
  const allFields: SetField[] = [];
  
  // Find all .set.keymap.json files
  const files = fs.readdirSync(dashSetsPath)
    .filter(f => f.endsWith('.set.keymap.json'));
  
  for (const file of files) {
    console.log(`Processing ${file}...`);
    const filePath = path.join(dashSetsPath, file);
    const fields = parseSetKeymap(filePath);
    allFields.push(...fields);
  }
  
  console.log(`Total fields extracted: ${allFields.length}`);
  
  const fieldMetadata = extractFieldMetadata(allFields);
  console.log(`Unique fields: ${fieldMetadata.size}`);
  
  const examples = generateTrainingExamples(allFields);
  console.log(`Training examples generated: ${examples.length}`);
  
  // Convert metadata to plain object
  const metadataObj: Record<string, { typicalValues: string[], isBoolean: boolean }> = {};
  for (const [key, value] of fieldMetadata) {
    metadataObj[key] = value;
  }
  
  return {
    examples,
    fieldMetadata: metadataObj
  };
}

// Run if called directly
if (require.main === module) {
  const dashSetsPath = path.join(__dirname, '../../../dash_sets');
  const result = generateFromSetFiles(dashSetsPath);
  
  // Save training data
  const outputPath = path.join(__dirname, 'training-data.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  console.log(`Saved to ${outputPath}`);
}
