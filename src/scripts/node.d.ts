declare module 'surplus/compiler' {
  /**
   * The Surplus compiler does not create a `sourceRoot` property.
   */
  export interface SourceMap {
    version: number;
    file: string;
    sources: string[];
    names: string[];
    mappings: string;
    sourcesContent?: string[];
  }

  export interface Options {
    sourcemap?: 'extract' | 'append' | null;
    sourcefile?: string;
    targetfile?: string;
  }

  export interface SourceCodeAndMap {
    src: string;
    map: SourceMap;
  }

  export function compile(str: string, opts?: Options): SourceCodeAndMap;
}
