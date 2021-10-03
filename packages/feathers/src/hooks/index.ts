import {
  getManager, HookContextData, HookManager, HookMap, HOOKS, hooks, Middleware
} from '../dependencies';
import {
  Service, ServiceOptions, HookContext, FeathersService, Application
} from '../declarations';
import { defaultServiceArguments, getHookMethods } from '../service';
import {
  collectBasicHooks,
  enableBasicHooks,
  fromAfterHook,
  fromBeforeHook,
  fromErrorHooks,
  groupBasicHooksByType
} from './basic';

export { fromAfterHook, fromBeforeHook, fromErrorHooks };

export function createContext (service: Service<any>, method: string, data: HookContextData = {}) {
  const createContext = (service as any)[method].createContext;

  if (typeof createContext !== 'function') {
    throw new Error(`Can not create context for method ${method}`);
  }

  return createContext(data) as HookContext;
}

export class FeathersHookManager<A> extends HookManager {
  constructor (public app: A, public method: string) {
    super();
    this._middleware = [];
  }

  collectMiddleware (self: any, args: any[]): Middleware[] {
    const app = this.app as any as Application;
    const appHooks = app.appHooks[HOOKS].concat(app.appHooks[this.method] || []);
    const basicAppHooks = collectBasicHooks(this.app, this.method);
    const middleware = super.collectMiddleware(self, args);
    const basicHooks = collectBasicHooks(self, this.method);

    return [...appHooks, ...basicAppHooks, ...middleware, ...basicHooks];
  }

  initializeContext (self: any, args: any[], context: HookContext) {
    const ctx = super.initializeContext(self, args, context);

    ctx.params = ctx.params || {};

    return ctx;
  }

  middleware (mw: Middleware[]) {
    this._middleware.push(...mw);
    return this;
  }
}

export function hookMixin<A> (
  this: A, service: FeathersService<A>, path: string, options: ServiceOptions
) {
  if (typeof service.hooks === 'function') {
    return service;
  }

  const app = this;
  const serviceMethodHooks = getHookMethods(service, options).reduce((res, method) => {
    const params = (defaultServiceArguments as any)[method] || [ 'data', 'params' ];

    res[method] = new FeathersHookManager<A>(app, method)
      .params(...params)
      .props({
        app,
        path,
        method,
        service,
        event: null,
        type: null
      });

    return res;
  }, {} as HookMap);
  const handleBasicHooks = enableBasicHooks(service);

  hooks(service, serviceMethodHooks);

  service.hooks = function (this: any, hookOptions: any) {
    // If `isGroupedByMethod`, hooks are formatted with the method, first, like `find: { before: [] }`
    const isGroupedByMethod = Object.values(hookOptions).some((o: any) => o?.before || o?.after || o?.error)
    if (isGroupedByMethod) hookOptions = groupBasicHooksByType(hookOptions)

    if (hookOptions.before || hookOptions.after || hookOptions.error) {
      return handleBasicHooks.call(this, hookOptions);
    }

    if (Array.isArray(hookOptions)) {
      return hooks(this, hookOptions);
    }

    Object.keys(hookOptions).forEach(method => {
      const manager = getManager(this[method]);

      if (!(manager instanceof FeathersHookManager)) {
        throw new Error(`Method ${method} is not a Feathers hooks enabled service method`);
      }

      manager.middleware(hookOptions[method]);
    });

    return this;
  }

  return service;
}
