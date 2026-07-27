import { type Parser, type ParserOptions } from 'prettier';
import findMinimumSemanticVersion from 'semver/ranges/min-version.js';

import { resolveSortOptions } from './options';
import {
  type ParserAstNode,
  getAstNodeName,
  getAstNodeTextRange,
} from './parser-ast';
import {
  DIRECTORY_FIELD_ORDER,
  ESLINT_CONFIG_FIELD_ORDER,
  GIT_HOOK_ORDER,
  NPM_LIFECYCLE_SCRIPT_NAMES,
  PACKAGE_JSON_FIELD_ORDER,
  PNPM_CONFIG_FIELD_ORDER,
  WIREIT_SCRIPT_FIELD_ORDER,
} from './utils/package-rules';

/** 保留 JSON 数字原文，避免 JavaScript 数值转换改变精度或字面量。 */
class JsonNumberLiteral {
  constructor(readonly sourceText: string) {}
}

type JsonPrimitive = boolean | JsonNumberLiteral | null | number | string;
type JsonValue = JsonObject | JsonPrimitive | JsonValue[];

interface JsonObject extends Record<string, JsonValue> {}

interface PackageSelector {
  name: string;
  versionRange: string | null;
}

interface ParserJsonAstNode extends ParserAstNode {
  readonly argument?: ParserJsonAstNode;
  readonly elements?: (ParserJsonAstNode | null)[];
  readonly key?: ParserJsonAstNode;
  readonly node?: ParserJsonAstNode;
  readonly operator?: unknown;
  readonly properties?: ParserJsonAstNode[];
}

type JsonKeyComparator = (leftKey: string, rightKey: string) => number;
type PackageJsonFieldSorter = (
  fieldValue: JsonValue,
  packageJson: JsonObject,
) => JsonValue;

const SEQUENTIAL_SCRIPT_PATTERN =
  /(?<=^|[\s&;<>|(])(?:run-s|npm-run-all2? .*(?:--sequential|--serial|-s))(?=$|[\s&;<>|)])/;

function compareText(leftText: string, rightText: string): number {
  if (leftText === rightText) {
    return 0;
  }
  return leftText < rightText ? -1 : 1;
}

function isJsonObject(value: unknown): value is JsonObject {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof JsonNumberLiteral)
  );
}

function isParserJsonAstNode(value: unknown): value is ParserJsonAstNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string'
  );
}

/**
 * 使用 parser AST 找回每个数字的源码范围。
 * JSON.parse 只负责校验结构，数字最终仍使用原始字面量。
 */
function preserveJsonNumberLiterals(
  jsonValue: JsonValue,
  parserJsonNode: ParserJsonAstNode,
  sourceText: string,
): JsonValue | undefined {
  if (parserJsonNode.type === 'JsonRoot') {
    const rootNode = parserJsonNode.node;

    if (!isParserJsonAstNode(rootNode)) {
      return undefined;
    }
    return preserveJsonNumberLiterals(jsonValue, rootNode, sourceText);
  }
  const isNumberLiteral = parserJsonNode.type === 'NumericLiteral';
  const isNegativeNumberLiteral =
    parserJsonNode.type === 'UnaryExpression' &&
    parserJsonNode.operator === '-' &&
    parserJsonNode.argument?.type === 'NumericLiteral';

  if (isNumberLiteral || isNegativeNumberLiteral) {
    const numberRange = getAstNodeTextRange(parserJsonNode);

    if (!numberRange || typeof jsonValue !== 'number') {
      return undefined;
    }
    return new JsonNumberLiteral(
      sourceText.slice(numberRange.start, numberRange.end),
    );
  }
  if (parserJsonNode.type === 'ObjectExpression') {
    if (!isJsonObject(jsonValue) || !Array.isArray(parserJsonNode.properties)) {
      return undefined;
    }
    const jsonObject = { ...jsonValue };
    const propertyNames = new Set<string>();

    for (const propertyNode of parserJsonNode.properties) {
      const propertyName = getAstNodeName(propertyNode.key);
      const propertyValueNode = propertyNode.value;

      if (
        propertyNode.type !== 'ObjectProperty' ||
        propertyName === null ||
        propertyNames.has(propertyName) ||
        !Object.hasOwn(jsonValue, propertyName) ||
        !isParserJsonAstNode(propertyValueNode)
      ) {
        return undefined;
      }
      propertyNames.add(propertyName);
      const propertyValue = preserveJsonNumberLiterals(
        jsonValue[propertyName]!,
        propertyValueNode,
        sourceText,
      );

      if (propertyValue === undefined) {
        return undefined;
      }
      jsonObject[propertyName] = propertyValue;
    }
    return jsonObject;
  }
  if (parserJsonNode.type === 'ArrayExpression') {
    if (
      !Array.isArray(jsonValue) ||
      !Array.isArray(parserJsonNode.elements) ||
      jsonValue.length !== parserJsonNode.elements.length
    ) {
      return undefined;
    }
    const jsonArray: JsonValue[] = [];

    for (const [
      elementIndex,
      elementNode,
    ] of parserJsonNode.elements.entries()) {
      if (!elementNode) {
        return undefined;
      }
      const elementValue = preserveJsonNumberLiterals(
        jsonValue[elementIndex]!,
        elementNode,
        sourceText,
      );

      if (elementValue === undefined) {
        return undefined;
      }
      jsonArray.push(elementValue);
    }
    return jsonArray;
  }
  return jsonValue;
}

/** 生成供 Prettier JSON 打印器再次格式化的紧凑中间文本。 */
function serializeJsonValue(jsonValue: JsonValue): string | null {
  if (jsonValue instanceof JsonNumberLiteral) {
    return jsonValue.sourceText;
  }
  if (typeof jsonValue === 'number') {
    return null;
  }
  if (Array.isArray(jsonValue)) {
    const serializedValues: string[] = [];

    for (const arrayValue of jsonValue) {
      const serializedValue = serializeJsonValue(arrayValue);

      if (serializedValue === null) {
        return null;
      }
      serializedValues.push(serializedValue);
    }
    return `[${serializedValues.join(',')}]`;
  }
  if (isJsonObject(jsonValue)) {
    const serializedFields: string[] = [];

    for (const [fieldName, fieldValue] of Object.entries(jsonValue)) {
      const serializedValue = serializeJsonValue(fieldValue);

      if (serializedValue === null) {
        return null;
      }
      serializedFields.push(`${JSON.stringify(fieldName)}:${serializedValue}`);
    }
    return `{${serializedFields.join(',')}}`;
  }
  return JSON.stringify(jsonValue);
}

function isStringArray(value: JsonValue): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function sortJsonObject(
  jsonObject: JsonObject,
  compareKeys: JsonKeyComparator = compareText,
): JsonObject {
  return Object.fromEntries(
    Object.entries(jsonObject).sort(([leftKey], [rightKey]) =>
      compareKeys(leftKey, rightKey),
    ),
  );
}

function sortJsonObjectByKeyOrder(
  jsonObject: JsonObject,
  keyOrder: readonly string[],
): JsonObject {
  const keyOrderIndexes = new Map(
    keyOrder.map((key, index) => [key, index] as const),
  );

  return sortJsonObject(jsonObject, (leftKey, rightKey) => {
    const leftIndex = keyOrderIndexes.get(leftKey);
    const rightIndex = keyOrderIndexes.get(rightKey);
    const isLeftKeyKnown = leftIndex !== undefined;
    const isRightKeyKnown = rightIndex !== undefined;

    if (isLeftKeyKnown && isRightKeyKnown) {
      return leftIndex - rightIndex;
    }
    if (isLeftKeyKnown) {
      return -1;
    }
    if (isRightKeyKnown) {
      return 1;
    }
    return compareText(leftKey, rightKey);
  });
}

/** 递归整理对象字段；数组顺序及数组内对象保持不变。 */
function sortJsonObjectRecursively(
  jsonObject: JsonObject,
  sortObject: (jsonObject: JsonObject) => JsonObject = sortJsonObject,
): JsonObject {
  const sortedNestedValues = Object.fromEntries(
    Object.entries(jsonObject).map(([key, value]) => [
      key,
      isJsonObject(value)
        ? sortJsonObjectRecursively(value, sortObject)
        : value,
    ]),
  );

  return sortObject(sortedNestedValues);
}

function sortJsonObjectValue(
  fieldValue: JsonValue,
  sortObject: (jsonObject: JsonObject) => JsonObject,
): JsonValue {
  return isJsonObject(fieldValue) ? sortObject(fieldValue) : fieldValue;
}

function sortJsonObjectValueAlphabetically(fieldValue: JsonValue): JsonValue {
  return sortJsonObjectValue(fieldValue, sortJsonObject);
}

function sortJsonObjectValueRecursively(fieldValue: JsonValue): JsonValue {
  return sortJsonObjectValue(fieldValue, sortJsonObjectRecursively);
}

function sortJsonObjectValueByKeyOrder(
  fieldValue: JsonValue,
  keyOrder: readonly string[],
): JsonValue {
  return sortJsonObjectValue(fieldValue, jsonObject =>
    sortJsonObjectByKeyOrder(jsonObject, keyOrder),
  );
}

function sortUniqueStringArrayValue(fieldValue: JsonValue): JsonValue {
  if (!isStringArray(fieldValue)) {
    return fieldValue;
  }
  return [...new Set(fieldValue)].sort(compareText);
}

function deduplicateStringArrayValue(fieldValue: JsonValue): JsonValue {
  return isStringArray(fieldValue) ? [...new Set(fieldValue)] : fieldValue;
}

function sortPersonValue(fieldValue: JsonValue): JsonValue {
  return sortJsonObjectValueByKeyOrder(fieldValue, ['name', 'email', 'url']);
}

function sortPeopleArrayValue(fieldValue: JsonValue): JsonValue {
  if (!Array.isArray(fieldValue)) {
    return fieldValue;
  }
  return fieldValue.map(person => sortPersonValue(person));
}

/** 已知字段遵循固定顺序，未知字段按名称排列，私有字段放在最后。 */
function sortPackageJsonFields(packageJson: JsonObject): JsonObject {
  const fieldOrderIndexes = new Map<string, number>(
    PACKAGE_JSON_FIELD_ORDER.map((fieldName, index) => [fieldName, index]),
  );

  return sortJsonObject(packageJson, (leftFieldName, rightFieldName) => {
    const leftIndex = fieldOrderIndexes.get(leftFieldName);
    const rightIndex = fieldOrderIndexes.get(rightFieldName);
    const isLeftFieldKnown = leftIndex !== undefined;
    const isRightFieldKnown = rightIndex !== undefined;

    if (isLeftFieldKnown && isRightFieldKnown) {
      return leftIndex - rightIndex;
    }
    if (isLeftFieldKnown) {
      return -1;
    }
    if (isRightFieldKnown) {
      return 1;
    }
    const isLeftFieldPrivate = leftFieldName.startsWith('_');
    const isRightFieldPrivate = rightFieldName.startsWith('_');

    if (isLeftFieldPrivate !== isRightFieldPrivate) {
      return isLeftFieldPrivate ? 1 : -1;
    }
    return compareText(leftFieldName, rightFieldName);
  });
}

/** npm 与其他包管理器采用不同的依赖名称比较方式。 */
function isNpmDependencyOrderPreferred(packageJson: JsonObject): boolean {
  const packageManager = packageJson.packageManager;

  if (typeof packageManager === 'string') {
    return packageManager.startsWith('npm@');
  }
  const devEngines = packageJson.devEngines;

  if (isJsonObject(devEngines)) {
    const devPackageManager = devEngines.packageManager;

    if (
      isJsonObject(devPackageManager) &&
      typeof devPackageManager.name === 'string'
    ) {
      return devPackageManager.name === 'npm';
    }
  }
  if (isJsonObject(packageJson.pnpm)) {
    return false;
  }
  return true;
}

function sortDependencyObject(
  dependencyObject: JsonObject,
  packageJson: JsonObject,
): JsonObject {
  if (!isNpmDependencyOrderPreferred(packageJson)) {
    return sortJsonObject(dependencyObject);
  }
  return sortJsonObject(dependencyObject, (leftName, rightName) =>
    leftName.localeCompare(rightName, 'en'),
  );
}

function sortDependencyValue(
  fieldValue: JsonValue,
  packageJson: JsonObject,
): JsonValue {
  return sortJsonObjectValue(fieldValue, dependencyObject =>
    sortDependencyObject(dependencyObject, packageJson),
  );
}

function sortWorkspacesValue(
  fieldValue: JsonValue,
  packageJson: JsonObject,
): JsonValue {
  if (!isJsonObject(fieldValue)) {
    return fieldValue;
  }
  const sortedWorkspaces = sortJsonObjectByKeyOrder(fieldValue, [
    'packages',
    'catalog',
  ]);
  const workspacePackages = sortedWorkspaces.packages;

  if (workspacePackages !== undefined) {
    sortedWorkspaces.packages = sortUniqueStringArrayValue(workspacePackages);
  }
  if (isJsonObject(sortedWorkspaces.catalog)) {
    sortedWorkspaces.catalog = sortDependencyObject(
      sortedWorkspaces.catalog,
      packageJson,
    );
  }
  return sortedWorkspaces;
}

function sortEslintRules(rules: JsonObject): JsonObject {
  return sortJsonObject(rules, (leftRuleName, rightRuleName) => {
    const leftPluginDepth = leftRuleName.split('/').length;
    const rightPluginDepth = rightRuleName.split('/').length;

    return (
      leftPluginDepth - rightPluginDepth ||
      leftRuleName.localeCompare(rightRuleName)
    );
  });
}

function sortEslintConfigObject(eslintConfig: JsonObject): JsonObject {
  const sortedConfig = sortJsonObjectByKeyOrder(
    eslintConfig,
    ESLINT_CONFIG_FIELD_ORDER,
  );

  for (const fieldName of ['env', 'globals', 'parserOptions', 'settings']) {
    if (isJsonObject(sortedConfig[fieldName])) {
      sortedConfig[fieldName] = sortJsonObject(sortedConfig[fieldName]);
    }
  }
  if (isJsonObject(sortedConfig.rules)) {
    sortedConfig.rules = sortEslintRules(sortedConfig.rules);
  }
  if (Array.isArray(sortedConfig.overrides)) {
    sortedConfig.overrides = sortedConfig.overrides.map(override =>
      isJsonObject(override) ? sortEslintConfigObject(override) : override,
    );
  }
  return sortedConfig;
}

function sortEslintConfigValue(fieldValue: JsonValue): JsonValue {
  return sortJsonObjectValue(fieldValue, sortEslintConfigObject);
}

function sortPrettierConfigObject(prettierConfig: JsonObject): JsonObject {
  const keyOrder = Object.keys(prettierConfig)
    .filter(key => key !== 'overrides')
    .sort(compareText);

  if (Object.hasOwn(prettierConfig, 'overrides')) {
    keyOrder.push('overrides');
  }
  const sortedConfig = sortJsonObjectByKeyOrder(prettierConfig, keyOrder);

  if (Array.isArray(sortedConfig.overrides)) {
    sortedConfig.overrides = sortedConfig.overrides.map(override => {
      if (!isJsonObject(override)) {
        return override;
      }
      const sortedOverride = sortJsonObject(override);

      if (isJsonObject(sortedOverride.options)) {
        sortedOverride.options = sortJsonObject(sortedOverride.options);
      }
      return sortedOverride;
    });
  }
  return sortedConfig;
}

function sortPrettierConfigValue(fieldValue: JsonValue): JsonValue {
  return sortJsonObjectValue(fieldValue, sortPrettierConfigObject);
}

function sortWireitScriptObject(scriptConfig: JsonObject): JsonObject {
  const sortedConfig = sortJsonObjectByKeyOrder(
    scriptConfig,
    WIREIT_SCRIPT_FIELD_ORDER,
  );

  if (Array.isArray(sortedConfig.dependencies)) {
    sortedConfig.dependencies = sortedConfig.dependencies.map(dependency =>
      sortJsonObjectValueByKeyOrder(dependency, ['script', 'cascade']),
    );
  }
  if (isJsonObject(sortedConfig.env)) {
    sortedConfig.env = sortJsonObject(
      Object.fromEntries(
        Object.entries(sortedConfig.env).map(([name, value]) => [
          name,
          sortJsonObjectValueByKeyOrder(value, ['external', 'default']),
        ]),
      ),
    );
  }
  if (isJsonObject(sortedConfig.service)) {
    sortedConfig.service = sortJsonObjectByKeyOrder(sortedConfig.service, [
      'readyWhen',
    ]);

    if (isJsonObject(sortedConfig.service.readyWhen)) {
      sortedConfig.service.readyWhen = sortJsonObject(
        sortedConfig.service.readyWhen,
      );
    }
  }
  return sortedConfig;
}

function sortWireitValue(fieldValue: JsonValue): JsonValue {
  if (!isJsonObject(fieldValue)) {
    return fieldValue;
  }
  return sortJsonObject(
    Object.fromEntries(
      Object.entries(fieldValue).map(([scriptName, scriptConfig]) => [
        scriptName,
        sortJsonObjectValue(scriptConfig, sortWireitScriptObject),
      ]),
    ),
  );
}

function hasSequentialScript(packageJson: JsonObject): boolean {
  const devDependencies = packageJson.devDependencies;

  if (!isJsonObject(devDependencies)) {
    return false;
  }
  const isSequentialRunnerInstalled =
    Object.hasOwn(devDependencies, 'npm-run-all') ||
    Object.hasOwn(devDependencies, 'npm-run-all2');

  if (!isSequentialRunnerInstalled) {
    return false;
  }
  return ['scripts', 'betterScripts'].some(fieldName => {
    const scripts = packageJson[fieldName];

    return (
      isJsonObject(scripts) &&
      Object.values(scripts).some(
        script =>
          typeof script === 'string' &&
          script.includes('*') &&
          SEQUENTIAL_SCRIPT_PATTERN.test(script),
      )
    );
  });
}

function sortScriptNames(
  scriptNames: string[],
  namespacePrefix = '',
): string[] {
  const scriptGroups = new Map<string, string[]>();

  for (const scriptName of scriptNames) {
    const unprefixedScriptName = namespacePrefix
      ? scriptName.slice(namespacePrefix.length + 1)
      : scriptName;
    const namespaceSeparatorIndex = unprefixedScriptName.indexOf(':');
    const scriptGroupName =
      namespaceSeparatorIndex > 0
        ? scriptName.slice(
            0,
            (namespacePrefix ? namespacePrefix.length + 1 : 0) +
              namespaceSeparatorIndex,
          )
        : scriptName;
    const groupedScriptNames = scriptGroups.get(scriptGroupName) ?? [];

    groupedScriptNames.push(scriptName);
    scriptGroups.set(scriptGroupName, groupedScriptNames);
  }
  return [...scriptGroups.keys()].sort(compareText).flatMap(scriptGroupName => {
    const groupedScriptNames = scriptGroups.get(scriptGroupName)!;
    const isNestedGroup =
      groupedScriptNames.length > 1 &&
      groupedScriptNames.some(
        scriptName =>
          scriptName !== scriptGroupName &&
          scriptName.startsWith(`${scriptGroupName}:`),
      );

    if (!isNestedGroup) {
      return groupedScriptNames.sort(compareText);
    }
    const directScriptNames = groupedScriptNames
      .filter(
        scriptName =>
          scriptName === scriptGroupName ||
          !scriptName.startsWith(`${scriptGroupName}:`),
      )
      .sort(compareText);
    const nestedScriptNames = groupedScriptNames.filter(scriptName =>
      scriptName.startsWith(`${scriptGroupName}:`),
    );

    return [
      ...directScriptNames,
      ...sortScriptNames(nestedScriptNames, scriptGroupName),
    ];
  });
}

/**
 * 将脚本名称按命名空间分组，并保持 pre、主体、post 生命周期顺序。
 * 检测到串行通配符任务时保留原分组顺序。
 */
function sortScriptsValue(
  fieldValue: JsonValue,
  packageJson: JsonObject,
): JsonValue {
  if (!isJsonObject(fieldValue)) {
    return fieldValue;
  }
  const scriptNames = Object.keys(fieldValue);
  const baseScriptNames = new Set<string>();
  const normalizedScriptNames = scriptNames.map(scriptName => {
    const baseScriptName = scriptName.replace(/^(?:pre|post)/, '');
    const isLifecycleScript = NPM_LIFECYCLE_SCRIPT_NAMES.has(baseScriptName);
    const isBaseScriptPresent = scriptNames.includes(baseScriptName);

    if (isLifecycleScript || isBaseScriptPresent) {
      baseScriptNames.add(baseScriptName);
      return baseScriptName;
    }
    return scriptName;
  });
  const orderedBaseScriptNames = hasSequentialScript(packageJson)
    ? [...new Set(normalizedScriptNames)]
    : sortScriptNames(normalizedScriptNames);
  const orderedScriptNames = orderedBaseScriptNames.flatMap(baseScriptName =>
    baseScriptNames.has(baseScriptName)
      ? [`pre${baseScriptName}`, baseScriptName, `post${baseScriptName}`]
      : [baseScriptName],
  );

  return Object.fromEntries(
    orderedScriptNames
      .filter(scriptName => Object.hasOwn(fieldValue, scriptName))
      .map(scriptName => [scriptName, fieldValue[scriptName]!] as const),
  );
}

/** 保留 exports 的路径和条件顺序，只把 default 条件放在同级末尾。 */
function sortExportsValue(fieldValue: JsonValue): JsonValue {
  if (!isJsonObject(fieldValue)) {
    return fieldValue;
  }
  const exportKeys = Object.keys(fieldValue);
  const exportPathKeys = exportKeys.filter(key => key.startsWith('.'));
  const exportConditionKeys = exportKeys.filter(
    key => !key.startsWith('.') && key !== 'default',
  );

  if (Object.hasOwn(fieldValue, 'default')) {
    exportConditionKeys.push('default');
  }
  return Object.fromEntries(
    [...exportPathKeys, ...exportConditionKeys].map(
      exportKey =>
        [exportKey, sortExportsValue(fieldValue[exportKey]!)] as const,
    ),
  );
}

function sortDevEnginesValue(fieldValue: JsonValue): JsonValue {
  if (!isJsonObject(fieldValue) || !isJsonObject(fieldValue.packageManager)) {
    return fieldValue;
  }
  return {
    ...fieldValue,
    packageManager: sortJsonObjectByKeyOrder(fieldValue.packageManager, [
      'name',
      'version',
      'onFail',
    ]),
  };
}

function getDependencyName(dependencyIdentifier: string): string {
  const versionSeparatorIndex = dependencyIdentifier.indexOf(
    '@',
    dependencyIdentifier.startsWith('@') ? 1 : 0,
  );

  return versionSeparatorIndex < 0
    ? dependencyIdentifier
    : dependencyIdentifier.slice(0, versionSeparatorIndex);
}

function parsePackageSelector(packageSelector: string): PackageSelector {
  const [nameAndVersion = packageSelector] = packageSelector.split('>');
  const versionSeparatorIndex = nameAndVersion.lastIndexOf('@');

  if (versionSeparatorIndex <= 0) {
    return { name: packageSelector, versionRange: null };
  }
  return {
    name: nameAndVersion.slice(0, versionSeparatorIndex),
    versionRange: nameAndVersion.slice(versionSeparatorIndex + 1) || null,
  };
}

function getMinimumSemanticVersion(
  versionRange: string,
): ReturnType<typeof findMinimumSemanticVersion> {
  try {
    return findMinimumSemanticVersion(versionRange);
  } catch {
    return null;
  }
}

/** pnpm override 先按包名排列，同包的版本范围再按最低语义版本排列。 */
function comparePnpmOverrideSelectors(
  leftSelector: string,
  rightSelector: string,
): number {
  const leftPackage = parsePackageSelector(leftSelector);
  const rightPackage = parsePackageSelector(rightSelector);

  if (leftPackage.name !== rightPackage.name) {
    return leftPackage.name.localeCompare(rightPackage.name, 'en');
  }
  if (!leftPackage.versionRange && !rightPackage.versionRange) {
    return 0;
  }
  if (!leftPackage.versionRange) {
    return -1;
  }
  if (!rightPackage.versionRange) {
    return 1;
  }
  const leftVersion = getMinimumSemanticVersion(leftPackage.versionRange);
  const rightVersion = getMinimumSemanticVersion(rightPackage.versionRange);

  if (!leftVersion && !rightVersion) {
    return compareText(leftPackage.versionRange, rightPackage.versionRange);
  }
  if (!leftVersion) {
    return 1;
  }
  if (!rightVersion) {
    return -1;
  }
  return leftVersion.compare(rightVersion);
}

function sortDependencyMetadataValue(fieldValue: JsonValue): JsonValue {
  return sortJsonObjectValue(fieldValue, dependencyMetadata => {
    const compareDependencyIdentifiers: JsonKeyComparator = (
      leftIdentifier,
      rightIdentifier,
    ) =>
      compareText(
        getDependencyName(leftIdentifier),
        getDependencyName(rightIdentifier),
      );

    return sortJsonObjectRecursively(dependencyMetadata, jsonObject =>
      sortJsonObject(jsonObject, compareDependencyIdentifiers),
    );
  });
}

function sortPnpmConfigValue(fieldValue: JsonValue): JsonValue {
  return sortJsonObjectValue(fieldValue, pnpmConfig => {
    const sortedPnpmConfig = sortJsonObjectRecursively(pnpmConfig, jsonObject =>
      sortJsonObjectByKeyOrder(jsonObject, PNPM_CONFIG_FIELD_ORDER),
    );

    if (!isJsonObject(sortedPnpmConfig.overrides)) {
      return sortedPnpmConfig;
    }
    return {
      ...sortedPnpmConfig,
      overrides: sortJsonObject(
        sortedPnpmConfig.overrides,
        comparePnpmOverrideSelectors,
      ),
    };
  });
}

/** 各字段的局部规则与 sort-package-json 4.0.0 保持一致。 */
const PACKAGE_JSON_FIELD_SORTERS: Readonly<
  Partial<Record<string, PackageJsonFieldSorter>>
> = {
  categories: deduplicateStringArrayValue,
  keywords: deduplicateStringArrayValue,
  bugs: fieldValue =>
    sortJsonObjectValueByKeyOrder(fieldValue, ['url', 'email']),
  repository: fieldValue =>
    sortJsonObjectValueByKeyOrder(fieldValue, ['type', 'url']),
  funding: fieldValue =>
    sortJsonObjectValueByKeyOrder(fieldValue, ['type', 'url']),
  license: fieldValue =>
    sortJsonObjectValueByKeyOrder(fieldValue, ['type', 'url']),
  author: sortPersonValue,
  maintainers: sortPeopleArrayValue,
  contributors: sortPeopleArrayValue,
  exports: sortExportsValue,
  bin: sortJsonObjectValueAlphabetically,
  directories: fieldValue =>
    sortJsonObjectValueByKeyOrder(fieldValue, DIRECTORY_FIELD_ORDER),
  files: deduplicateStringArrayValue,
  workspaces: sortWorkspacesValue,
  binary: fieldValue =>
    sortJsonObjectValueByKeyOrder(fieldValue, [
      'module_name',
      'module_path',
      'remote_path',
      'package_name',
      'host',
    ]),
  scripts: sortScriptsValue,
  betterScripts: sortScriptsValue,
  wireit: sortWireitValue,
  contributes: sortJsonObjectValueAlphabetically,
  activationEvents: deduplicateStringArrayValue,
  husky: fieldValue => {
    if (!isJsonObject(fieldValue) || !isJsonObject(fieldValue.hooks)) {
      return fieldValue;
    }
    return {
      ...fieldValue,
      hooks: sortJsonObjectByKeyOrder(fieldValue.hooks, GIT_HOOK_ORDER),
    };
  },
  'simple-git-hooks': fieldValue =>
    sortJsonObjectValueByKeyOrder(fieldValue, GIT_HOOK_ORDER),
  commitlint: sortJsonObjectValueAlphabetically,
  config: sortJsonObjectValueAlphabetically,
  nodemonConfig: sortJsonObjectValueAlphabetically,
  browserify: sortJsonObjectValueAlphabetically,
  babel: sortJsonObjectValueAlphabetically,
  xo: sortJsonObjectValueAlphabetically,
  prettier: sortPrettierConfigValue,
  eslintConfig: sortEslintConfigValue,
  npmpkgjsonlint: sortJsonObjectValueAlphabetically,
  npmPackageJsonLintConfig: sortJsonObjectValueAlphabetically,
  npmpackagejsonlint: sortJsonObjectValueAlphabetically,
  release: sortJsonObjectValueAlphabetically,
  remarkConfig: sortJsonObjectValueAlphabetically,
  ava: sortJsonObjectValueAlphabetically,
  jest: sortJsonObjectValueAlphabetically,
  'jest-junit': sortJsonObjectValueAlphabetically,
  'jest-stare': sortJsonObjectValueAlphabetically,
  mocha: sortJsonObjectValueAlphabetically,
  nyc: sortJsonObjectValueAlphabetically,
  c8: sortJsonObjectValueAlphabetically,
  tap: sortJsonObjectValueAlphabetically,
  oclif: sortJsonObjectValueRecursively,
  resolutions: sortJsonObjectValueAlphabetically,
  overrides: sortDependencyValue,
  dependencies: sortDependencyValue,
  devDependencies: sortDependencyValue,
  dependenciesMeta: sortDependencyMetadataValue,
  peerDependencies: sortDependencyValue,
  peerDependenciesMeta: sortJsonObjectValueRecursively,
  optionalDependencies: sortDependencyValue,
  bundledDependencies: sortUniqueStringArrayValue,
  bundleDependencies: sortUniqueStringArrayValue,
  extensionPack: sortUniqueStringArrayValue,
  extensionDependencies: sortUniqueStringArrayValue,
  engines: sortJsonObjectValueAlphabetically,
  engineStrict: sortJsonObjectValueAlphabetically,
  devEngines: sortDevEnginesValue,
  volta: fieldValue =>
    sortJsonObjectValueByKeyOrder(fieldValue, ['node', 'npm', 'yarn']),
  preferGlobal: sortJsonObjectValueAlphabetically,
  publishConfig: sortJsonObjectValueAlphabetically,
  badges: fieldValue => {
    if (!Array.isArray(fieldValue)) {
      return fieldValue;
    }
    return fieldValue.map(badge =>
      sortJsonObjectValueByKeyOrder(badge, ['description', 'url', 'href']),
    );
  },
  galleryBanner: sortJsonObjectValueAlphabetically,
  pnpm: sortPnpmConfigValue,
};

function sortPackageJsonObject(packageJson: JsonObject): JsonObject {
  const sortedPackageJsonFields = sortPackageJsonFields(packageJson);

  return Object.fromEntries(
    Object.entries(sortedPackageJsonFields).map(([fieldName, fieldValue]) => {
      const fieldSorter = Object.hasOwn(PACKAGE_JSON_FIELD_SORTERS, fieldName)
        ? PACKAGE_JSON_FIELD_SORTERS[fieldName]
        : undefined;

      return [
        fieldName,
        fieldSorter ? fieldSorter(fieldValue, packageJson) : fieldValue,
      ];
    }),
  );
}

function isPackageJsonFile(filePath: string | undefined): boolean {
  return filePath?.split(/[\\/]/).at(-1) === 'package.json';
}

/**
 * 只处理 package.json。
 * 解析失败、AST 结构不完整或数字无法还原时直接返回原文。
 */
export async function preprocessPackageJson(
  sourceText: string,
  prettierOptions: ParserOptions,
  parser: Parser,
): Promise<string> {
  if (
    !isPackageJsonFile(prettierOptions.filepath) ||
    !resolveSortOptions(prettierOptions).packageSort
  ) {
    return sourceText;
  }
  try {
    const parsedPackageJson: unknown = JSON.parse(sourceText);

    if (!isJsonObject(parsedPackageJson)) {
      return sourceText;
    }
    const parserJsonAst: unknown = await parser.parse(
      sourceText,
      prettierOptions,
    );

    if (!isParserJsonAstNode(parserJsonAst)) {
      return sourceText;
    }
    const packageJsonWithSourceNumbers = preserveJsonNumberLiterals(
      parsedPackageJson,
      parserJsonAst,
      sourceText,
    );

    if (!isJsonObject(packageJsonWithSourceNumbers)) {
      return sourceText;
    }
    return (
      serializeJsonValue(sortPackageJsonObject(packageJsonWithSourceNumbers)) ??
      sourceText
    );
  } catch {
    return sourceText;
  }
}
