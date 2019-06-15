import fs from 'fs';
import path, { ParsedPath } from 'path';
import { RawSourceMap, SourceMapConsumer, SourceMapGenerator } from 'source-map';
/// <reference path="node.d.ts"/>
import { compile, SourceCodeAndMap } from 'surplus/compiler';

// tslint:disable:no-console

const SOURCE_MAPPING_URL_MARKER = '//# sourceMappingURL=';
const FILENAME_REGEX = /(\S+\.jsx\.map)\w*$/;

type Range = [number, number];

function rangeWithSourceMapFileName(fileContent: string): Range | undefined {
  const lastIndex = fileContent.lastIndexOf(SOURCE_MAPPING_URL_MARKER);
  if (lastIndex >= 0) {
    const indexOfFileName = lastIndex + SOURCE_MAPPING_URL_MARKER.length;
    const match = fileContent.substring(indexOfFileName).match(FILENAME_REGEX);
    if (match !== null) {
      return [indexOfFileName, indexOfFileName + match[1].length];
    }
  }
  return undefined;
}

async function mergeSourceMaps(jsFromJsxMap: RawSourceMap, jsxFromTsxMap: RawSourceMap): Promise<RawSourceMap> {
  return SourceMapConsumer.with(jsFromJsxMap, null, async (jsFromJsxMapConsumer) => {
    return await SourceMapConsumer.with(jsxFromTsxMap, null, async (jsxFromTsxMapConsumer) => {
      const jsFromTsxSourceMapGenerator = SourceMapGenerator.fromSourceMap(jsFromJsxMapConsumer);
      jsFromTsxSourceMapGenerator.applySourceMap(jsxFromTsxMapConsumer);
      return jsFromTsxSourceMapGenerator.toJSON();
    });
  });
}

async function writeOutJsAndJsFromTsxMap(jsFileName: string, jsFileContent: string, jsFromJsxMap: RawSourceMap,
    jsxFromTsxMap: RawSourceMap): Promise<void> {
  const jsFromTsxMap: RawSourceMap = await mergeSourceMaps(jsFromJsxMap, jsxFromTsxMap);
  fs.writeFileSync(jsFileName, jsFileContent);
  fs.writeFileSync(jsFileName + '.map', JSON.stringify(jsFromTsxMap));
}

const promises: Promise<void>[] = [];
for (let i = 2; i < process.argv.length; ++i) {
  const jsxFileName = process.argv[i];
  const parsedJsxPath: ParsedPath = path.parse(process.argv[i]);
  if (parsedJsxPath.ext !== '.jsx') {
    console.warn(`Skipping file ${jsxFileName} because it does not have the expected extension “.jsx”.`);
    continue;
  }
  const jsxFileContent: string = fs.readFileSync(jsxFileName).toString();
  const range: Range | undefined = rangeWithSourceMapFileName(jsxFileContent);
  if (range === undefined || jsxFileContent.slice(range[0], range[1]) !== parsedJsxPath.base + '.map') {
    console.warn(`Skipping file ${jsxFileName} because it does not have a source map, or not at the expected place.`);
    continue;
  }
  const jsxFromTsxMap: RawSourceMap = JSON.parse(fs.readFileSync(jsxFileName + '.map').toString());

  const jsFileName: string = jsxFileName.slice(0, jsxFileName.length - parsedJsxPath.ext.length) + '.js';
  const surplusResult: SourceCodeAndMap = compile(jsxFileContent, {
    sourcemap: 'extract',
    sourcefile: path.basename(jsxFileName),
    targetfile: path.basename(jsFileName),
  });
  const jsFromJsxMap = surplusResult.map;
  let jsFileContent: string | undefined;
  const lastIndex = surplusResult.src.lastIndexOf(SOURCE_MAPPING_URL_MARKER);
  if (lastIndex >= 0) {
    const match = surplusResult.src.substring(lastIndex + SOURCE_MAPPING_URL_MARKER.length).match(FILENAME_REGEX);
    if (match !== null) {
      jsFileContent =
          `${surplusResult.src.substring(0, lastIndex)}${SOURCE_MAPPING_URL_MARKER}${parsedJsxPath.name}.js.map\n`;
    }
  }
  if (jsFileContent === undefined) {
    console.error(`Skipping file ${jsxFileName} because of an unexpected result by the Surplus compiler. The output ` +
        `does not have a source map, or not at the expected place. But ${jsxFileName} did.`);
    continue;
  }

  const promise: Promise<void> = writeOutJsAndJsFromTsxMap(jsFileName, jsFileContent, jsFromJsxMap, jsxFromTsxMap);
  promises.push(promise);
  promise.catch((reason: any) => {
    console.error(`Unexpected error while processing file ${jsxFileName}: ${reason}`);
  });
}
Promise.all(promises).catch(() => process.exit(1));
