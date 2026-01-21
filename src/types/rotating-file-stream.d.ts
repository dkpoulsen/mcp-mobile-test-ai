declare module 'rotating-file-stream' {
  import { Stream, Writable } from 'stream';

  interface RotatingFileStream extends Writable {
    readonly path: string;
  }

  interface Options {
    path?: string;
    size?: string;
    interval?: string;
    compress?: string | boolean;
    maxFiles?: number;
    history?: string;
  }

  interface CreateStreamOptions extends Options {
    tee?: boolean;
    immutable?: boolean;
  }

  function createStream(
    filename: string,
    options?: CreateStreamOptions
  ): RotatingFileStream;

  export { createStream, RotatingFileStream, Options, CreateStreamOptions };
}
