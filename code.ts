figma.showUI(__html__, {
  width: 500,
  height: 500,
  themeColors: true,
});

figma.ui.onmessage = (e) => {
  if (e.type === "EXPORT") {
    exportToCSS();
  }
}

function exportToCSS() {
  const collections = figma.variables.getLocalVariableCollections();
  const processedCollection = processCollection(collections);
  figma.ui.postMessage({ type: "EXPORT_RESULT", css: convertVariableSetCollectionToCSS(processedCollection) });
}

function convertVariables(variables: CSSVariables, indent = '  '): string {
  let output = '';

  for (const variableName in variables) {
    if (Object.prototype.hasOwnProperty.call(variables, variableName)) {
      const value = variables[variableName];
      output += `\n${indent}${variableName}: ${value};`;
    }
  }

  return output;
}

function convertVariableSetToCSS({ mediaQuery, variables }: VariableSet): string {
  if (mediaQuery.value) {
    return `@media (${mediaQuery.type}: ${mediaQuery.value}) {\n  :root {${convertVariables(variables, '    ')}\n  }\n}\n\n`;
  }

  return `:root {${convertVariables(variables)}\n}\n\n`;
}

function convertVariableSetCollectionToCSS(variableSetCollection: VariableSetCollection): string {
  let output = '';

  for (const collectionName in variableSetCollection) {
    if (Object.prototype.hasOwnProperty.call(variableSetCollection, collectionName)) {
      // get variableSets and sort them so non MQ sets go first.
      const variableSets = variableSetCollection[collectionName].sort((a, b) => Number(!!a.mediaQuery.value) - Number(!!b.mediaQuery.value));
      output += `/* ${collectionName} */\n${variableSets.map(convertVariableSetToCSS).join('')}`;
    }
  }

  return output;
}

type MediaQueryType = 'min-width' | 'prefers-color-scheme';
type CSSVariables = { [key: string]: string };
type VariableSet = { mediaQuery: { type: MediaQueryType, value?: string}, variables: CSSVariables };
type VariableSetCollection = { [key: string]: VariableSet[] };

function normalizeToCSSVariableName(name: string): string {
  return `--${name.toLowerCase().replace('/', '-').replace(' ', '-')}`;
}

function processCollection(collections: VariableCollection[]) {
  const variableSetCollection: VariableSetCollection = {};
  collections.forEach(({ name, modes, variableIds }) => {
    // export only color and spacing tokens
    
    if (name !== 'Color Tokens' && name !== 'Spacing Tokens' && name !== 'Theming' && name !== 'Breakpoints') return;

    const variableSets: VariableSet[] = [];
    modes.forEach((mode) => {
      const variableSet: VariableSet = {
        mediaQuery: mode.name === 'Desktop' || mode.name === 'Mobile' ? {
          type: 'min-width',
          value: mode.name === 'Desktop' ? '64em' : undefined,
        } : {
          type: 'prefers-color-scheme',
          value: mode.name === 'Dark Mode' ? 'dark' : undefined,
        },
        variables: {},
      };

      variableIds.forEach((variableId) => {
        const variable = figma.variables.getVariableById(variableId);
        if (!variable) return;
        const { resolvedType, valuesByMode } = variable;
        const variableName = normalizeToCSSVariableName(variable.name);
        const value = valuesByMode[mode.modeId];
        if (!value || "FLOAT" !== resolvedType && "COLOR" !== resolvedType) return;
        
        if (typeof value === 'object' && 'type' in value && value.type === 'VARIABLE_ALIAS') {
          const alias = figma.variables.getVariableById(value.id);
          if (!alias) return;
          variableSet.variables[variableName] = `var(${normalizeToCSSVariableName(alias.name)})`;
          return
        }

        // px to rem
        if ("FLOAT" === resolvedType) {
          variableSet.variables[variableName] = `${value as number / 16}rem`;
          return;
        }

        // rgb to hex
        variableSet.variables[variableName] = rgbToHex(value);
        return;
      });
      variableSets.push(variableSet);
    });
    variableSetCollection[name] = variableSets;
  })
  
  return variableSetCollection;
}

function rgbToHex({ r, g, b, a }: any) {
  if (a !== 1) {
    return `rgba(${[r, g, b]
      .map((n) => Math.round(n * 255))
      .join(", ")}, ${a.toFixed(4)})`;
  }
  const toHex = (value: any) => {
    const hex = Math.round(value * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  const hex = [toHex(r), toHex(g), toHex(b)].join("");
  return `#${hex}`;
}