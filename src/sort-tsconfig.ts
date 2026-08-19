import { type Parser, type ParserOptions } from 'prettier';

import { resolveTsconfigOptions } from './options';
import {
  type ParserAstCommentWithTextRange,
  type ParserAstNode,
  getAstNodeName,
  getAstNodeTextRange,
  getProgramComments,
  getSortedAstCommentsWithTextRanges,
  isParserAstNode,
  isPrettierIgnored,
} from './parser-ast';
import { type SourceTextEdit, applySourceTextEdits } from './utils/source-text';
import {
  COMPILER_OPTION_FIELD_GROUPS,
  TS_CONFIG_ROOT_FIRST_FIELDS,
  TS_CONFIG_ROOT_LAST_FIELDS,
} from './utils/tsconfig-rules';

function createFieldIndexes(
  fieldNames: readonly string[],
): ReadonlyMap<string, number> {
  return new Map(
    fieldNames.map((fieldName, fieldIndex) => [fieldName, fieldIndex] as const),
  );
}

const COMPILER_OPTION_FIELD_INDEXES = createFieldIndexes(
  COMPILER_OPTION_FIELD_GROUPS.flat(),
);

const COMPILER_OPTION_FIELD_GROUP_INDEXES = new Map<string, number>(
  COMPILER_OPTION_FIELD_GROUPS.flatMap((fieldGroup, groupIndex) =>
    fieldGroup.map(fieldName => [fieldName, groupIndex] as const),
  ),
);

const ROOT_FIRST_FIELD_INDEXES = createFieldIndexes(
  TS_CONFIG_ROOT_FIRST_FIELDS,
);

const ROOT_LAST_FIELD_INDEXES = createFieldIndexes(TS_CONFIG_ROOT_LAST_FIELDS);

interface RenderedProperty {
  readonly name: string;
  readonly originalIndex: number;
  readonly sourceText: string;
}

interface RenderedObject {
  readonly isOrderChanged: boolean;
  readonly sourceText: string;
}

function getTsconfigRootNode(parserAst: ParserAstNode): ParserAstNode | null {
  if (parserAst.type === 'ObjectExpression') {
    return parserAst;
  }
  return parserAst.type === 'JsonRoot' &&
    parserAst.node?.type === 'ObjectExpression'
    ? parserAst.node
    : null;
}

function getCompilerOptionsNode(
  rootNode: ParserAstNode,
): { property: ParserAstNode; value: ParserAstNode } | null {
  const propertyNodes = rootNode.properties;

  if (!Array.isArray(propertyNodes)) {
    return null;
  }
  const compilerOptions = propertyNodes.filter(
    propertyNode => getAstNodeName(propertyNode.key) === 'compilerOptions',
  );

  if (compilerOptions.length !== 1) {
    return null;
  }
  const property = compilerOptions[0];
  const value = property?.value;

  return property?.type === 'ObjectProperty' &&
    isParserAstNode(value) &&
    value.type === 'ObjectExpression'
    ? { property, value }
    : null;
}

function hasDirectComments(
  objectNode: ParserAstNode,
  propertyNodes: readonly ParserAstNode[],
  sortedComments: readonly ParserAstCommentWithTextRange[],
): boolean {
  const objectRange = getAstNodeTextRange(objectNode);
  const propertyRanges = propertyNodes.map(getAstNodeTextRange);

  if (!objectRange || propertyRanges.some(propertyRange => !propertyRange)) {
    return true;
  }

  return sortedComments.some(({ textRange: commentRange }) => {
    if (
      commentRange.start < objectRange.start ||
      commentRange.end > objectRange.end
    ) {
      return false;
    }
    return !propertyRanges.some(
      propertyRange =>
        propertyRange &&
        propertyRange.start <= commentRange.start &&
        propertyRange.end >= commentRange.end,
    );
  });
}

function sortRenderedProperties(
  renderedProperties: readonly RenderedProperty[],
  fieldIndexes: ReadonlyMap<string, number>,
  lastFieldIndexes?: ReadonlyMap<string, number>,
): RenderedProperty[] {
  return [...renderedProperties].sort((left, right) => {
    const leftFieldIndex = fieldIndexes.get(left.name);
    const rightFieldIndex = fieldIndexes.get(right.name);

    if (leftFieldIndex !== undefined && rightFieldIndex !== undefined) {
      return leftFieldIndex - rightFieldIndex;
    }
    if (leftFieldIndex !== undefined) {
      return -1;
    }
    if (rightFieldIndex !== undefined) {
      return 1;
    }
    const leftLastFieldIndex = lastFieldIndexes?.get(left.name);
    const rightLastFieldIndex = lastFieldIndexes?.get(right.name);

    if (leftLastFieldIndex !== undefined && rightLastFieldIndex !== undefined) {
      return leftLastFieldIndex - rightLastFieldIndex;
    }
    if (leftLastFieldIndex !== undefined) {
      return 1;
    }
    if (rightLastFieldIndex !== undefined) {
      return -1;
    }
    return left.originalIndex - right.originalIndex;
  });
}

function getPropertySeparator(
  property: RenderedProperty,
  shouldSeparateCategories: boolean,
  previousProperty?: RenderedProperty,
): string {
  if (!previousProperty) {
    return '';
  }
  if (!shouldSeparateCategories) {
    return ',';
  }
  const previousGroupIndex = COMPILER_OPTION_FIELD_GROUP_INDEXES.get(
    previousProperty.name,
  );
  const groupIndex = COMPILER_OPTION_FIELD_GROUP_INDEXES.get(property.name);

  return previousGroupIndex !== undefined &&
    groupIndex !== undefined &&
    previousGroupIndex !== groupIndex
    ? ',\n\n'
    : ',';
}

function renderProperty(
  sourceText: string,
  propertyNode: ParserAstNode,
  originalIndex: number,
  replacementText?: string,
): RenderedProperty | null {
  const propertyName = getAstNodeName(propertyNode.key);
  const propertyRange = getAstNodeTextRange(propertyNode);
  const propertyValue = propertyNode.value;

  if (
    propertyNode.type !== 'ObjectProperty' ||
    propertyName === null ||
    !propertyRange ||
    !isParserAstNode(propertyValue)
  ) {
    return null;
  }
  return {
    name: propertyName,
    originalIndex,
    sourceText:
      replacementText ??
      sourceText.slice(propertyRange.start, propertyRange.end),
  };
}

function replacePropertyValue(
  sourceText: string,
  propertyNode: ParserAstNode,
  valueNode: ParserAstNode,
  replacementText: string,
): string | null {
  const propertyRange = getAstNodeTextRange(propertyNode);
  const valueRange = getAstNodeTextRange(valueNode);

  if (
    !propertyRange ||
    !valueRange ||
    valueRange.start < propertyRange.start ||
    valueRange.end > propertyRange.end
  ) {
    return null;
  }
  return (
    sourceText.slice(propertyRange.start, valueRange.start) +
    replacementText +
    sourceText.slice(valueRange.end, propertyRange.end)
  );
}

function renderObject(
  sourceText: string,
  objectNode: ParserAstNode,
  sortedComments: readonly ParserAstCommentWithTextRange[],
  fieldIndexes: ReadonlyMap<string, number>,
  shouldSeparateCategories: boolean,
  propertyReplacements?: ReadonlyMap<ParserAstNode, string>,
  lastFieldIndexes?: ReadonlyMap<string, number>,
): RenderedObject | null {
  const objectRange = getAstNodeTextRange(objectNode);
  const propertyNodes = objectNode.properties;

  if (
    objectNode.type !== 'ObjectExpression' ||
    !objectRange ||
    !Array.isArray(propertyNodes)
  ) {
    return null;
  }
  const objectSource = sourceText.slice(objectRange.start, objectRange.end);

  if (propertyNodes.length === 0) {
    return { isOrderChanged: false, sourceText: objectSource };
  }
  if (hasDirectComments(objectNode, propertyNodes, sortedComments)) {
    return null;
  }
  const propertyNames = new Set<string>();
  const renderedProperties: RenderedProperty[] = [];

  for (const [propertyIndex, propertyNode] of propertyNodes.entries()) {
    const renderedProperty = renderProperty(
      sourceText,
      propertyNode,
      propertyIndex,
      propertyReplacements?.get(propertyNode),
    );

    if (!renderedProperty || propertyNames.has(renderedProperty.name)) {
      return null;
    }
    propertyNames.add(renderedProperty.name);
    renderedProperties.push(renderedProperty);
  }

  const sortedProperties = sortRenderedProperties(
    renderedProperties,
    fieldIndexes,
    lastFieldIndexes,
  );
  const isOrderChanged = sortedProperties.some(
    (renderedProperty, propertyIndex) =>
      renderedProperty.originalIndex !== propertyIndex,
  );

  return {
    isOrderChanged,
    sourceText: `{${sortedProperties
      .map(
        (renderedProperty, propertyIndex) =>
          getPropertySeparator(
            renderedProperty,
            shouldSeparateCategories,
            sortedProperties[propertyIndex - 1],
          ) + renderedProperty.sourceText,
      )
      .join('')}}`,
  };
}

function isTsconfigFile(filePath?: string): boolean {
  const fileName = filePath?.split(/[\\/]/).at(-1);

  return fileName ? /^tsconfig(?:\..+)?\.json$/.test(fileName) : false;
}

/**
 * 只处理 tsconfig.json 和 tsconfig.*.json。
 * AST、字段或注释归属无法安全处理时返回原文。
 */
export async function preprocessTsconfig(
  sourceText: string,
  prettierOptions: ParserOptions,
  parser: Parser,
): Promise<string> {
  if (!isTsconfigFile(prettierOptions.filepath)) {
    return sourceText;
  }
  const { tsconfigSeparation, tsconfigSort } =
    resolveTsconfigOptions(prettierOptions);

  if (!tsconfigSort) {
    return sourceText;
  }
  try {
    const parserAst: unknown = await parser.parse(sourceText, prettierOptions);

    if (!isParserAstNode(parserAst)) {
      return sourceText;
    }
    const rootNode = getTsconfigRootNode(parserAst);

    if (!rootNode) {
      return sourceText;
    }
    const sortedComments = getSortedAstCommentsWithTextRanges(
      getProgramComments(parserAst),
    );
    const rootRange = getAstNodeTextRange(rootNode);

    if (
      !rootRange ||
      isPrettierIgnored(sourceText, rootRange, sortedComments)
    ) {
      return sourceText;
    }
    let compilerOptionsEdit: SourceTextEdit | undefined;
    let propertyReplacements: ReadonlyMap<ParserAstNode, string> | undefined;

    const compilerOptions = getCompilerOptionsNode(rootNode);

    if (compilerOptions) {
      const propertyRange = getAstNodeTextRange(compilerOptions.property);
      const valueRange = getAstNodeTextRange(compilerOptions.value);

      if (
        propertyRange &&
        valueRange &&
        !isPrettierIgnored(sourceText, propertyRange, sortedComments)
      ) {
        const renderedCompilerOptions = renderObject(
          sourceText,
          compilerOptions.value,
          sortedComments,
          COMPILER_OPTION_FIELD_INDEXES,
          tsconfigSeparation,
        );
        const renderedProperty = renderedCompilerOptions
          ? replacePropertyValue(
              sourceText,
              compilerOptions.property,
              compilerOptions.value,
              renderedCompilerOptions.sourceText,
            )
          : null;

        if (renderedCompilerOptions && renderedProperty) {
          compilerOptionsEdit = {
            start: valueRange.start,
            end: valueRange.end,
            replacementText: renderedCompilerOptions.sourceText,
          };
          propertyReplacements = new Map([
            [compilerOptions.property, renderedProperty],
          ]);
        }
      }
    }
    const renderedTsconfig = renderObject(
      sourceText,
      rootNode,
      sortedComments,
      ROOT_FIRST_FIELD_INDEXES,
      false,
      propertyReplacements,
      ROOT_LAST_FIELD_INDEXES,
    );
    const sourceTextEdits: SourceTextEdit[] = [];

    if (
      renderedTsconfig &&
      (renderedTsconfig.isOrderChanged || propertyReplacements)
    ) {
      sourceTextEdits.push({
        start: rootRange.start,
        end: rootRange.end,
        replacementText: renderedTsconfig.sourceText,
      });
    } else if (compilerOptionsEdit) {
      sourceTextEdits.push(compilerOptionsEdit);
    }

    if (sourceTextEdits.length === 0) {
      return sourceText;
    }
    const editedSourceText = applySourceTextEdits(sourceText, sourceTextEdits);

    if (editedSourceText === null) {
      return sourceText;
    }
    await parser.parse(editedSourceText, prettierOptions);

    return editedSourceText;
  } catch {
    return sourceText;
  }
}
