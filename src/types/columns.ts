// Allow ColumnsMap to be accessed as an object too
export class ColumnsMap extends Map<string, string[]> {
  [key: string]: Map<string, string[]>[keyof Map<string, string[]>] | string[];
  constructor() {
    super();
    const columns = new Map<string, string[]>() as ColumnsMap;
    return columns;
    //return new Proxy<ColumnsMap>(columns, columnMapAccessorProxy)
  }
}
/*
  // Proxy handler to implement ColumnsMap type
  export const columnMapAccessorProxy = {
    get: function (
      target: ColumnsMap,
      prop: symbol | string,
      receiver: ColumnsMap,
    ) {
      const value = Reflect.get(target, prop, receiver)
      if (typeof value === 'function') return value.bind(target)
      if (prop === Symbol.iterator) return target[Symbol.iterator].bind(target)
      if (value === undefined) return target.get(prop as string)
      return value
    },
    set: function (target: ColumnsMap, prop: string, value: string[]) {
      target.set(prop, value)
      return true
    },
    has: function (target: ColumnsMap, prop: string) {
      return Reflect.has(target, prop)
    },
    ownKeys: function (target: ColumnsMap) {
      return Array.from(target.keys())
    },
    getOwnPropertyDescriptor: function (
      target: ColumnsMap,
      prop: string,
    ): PropertyDescriptor {
      return { enumerable: true, configurable: true, value: target.get(prop) }
    },
  }
  */
