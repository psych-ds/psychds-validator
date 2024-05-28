export interface issueInfo {
  key: string
  severity?: string
  reason?: string
  evidence?: string
}


export interface psychDSFile {
    // Filename
    name: string
    // Dataset relative path for the file
    path: string
    // File size in bytes
    size: number
    // BIDS ignore status of the file
    ignored: boolean
    // ReadableStream to file raw contents
    stream: ReadableStream<Uint8Array>
    // string storage of file contents
    fileText: string
    // object for temporarily storing issues with jsonld before issue object is created in validate()
    issueInfo: issueInfo[]
    // slot to hold expanded version of jsonld
    expanded: object
    // Resolve stream to decoded utf-8 text
    text: () => Promise<string>
    // Read a range of bytes
    readBytes: (size: number, offset?: number) => Promise<Uint8Array>
  }