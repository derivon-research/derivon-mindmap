import { access, constants } from 'node:fs/promises';
import path from 'node:path';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';

/**
 * The SDK does not export this type from its entry point, so it is taken from the method
 * that produces it rather than reached for inside the package.
 */
type Model = NonNullable<ReturnType<ModelRuntime['getModel']>>;

/**
 * A provider is offered only when Pi attributes its credential to one of the
 * application's own two files. Everything else — an API key in the operator's shell, a
 * Google ADC file, an AWS profile — means "something else on this machine configured
 * it", and this application does not run on those.
 *
 * See ADR-0010. The attribution filter is the rule; clearing the companion's inherited
 * environment is defence in depth layered on top of it.
 */
const OWN_CREDENTIAL_SOURCES = new Set(['stored', 'models_json_key', 'models_json_command']);

export type CatalogModel = {
  readonly providerId: string;
  readonly modelId: string;
  /** The catalog's own display name, absent when it does not declare one. */
  readonly name?: string;
};

/**
 * What the panel needs to render the model picker, including the reason a catalog is
 * empty. An empty catalog is a legitimate configuration state, so it is never on its own
 * an error — but it always has an explanation, and the operator is owed it.
 */
export type ModelCatalog = {
  readonly models: readonly CatalogModel[];
  readonly diagnosis?: string;
};

export type ModelConfiguration = {
  /** The catalog and, when it is empty or partial, why. Never rejects. */
  listAvailable(): Promise<ModelCatalog>;
  /** The model behind an identifier, or a reason it cannot be used. */
  resolve(providerId: string, modelId: string): Promise<Model>;
  /** The files this configuration was read from, for diagnostics and logs. */
  readonly paths: { readonly models: string; readonly auth: string };
  /**
   * Exposed only so `createAgentSession` can be wired to the same runtime; model
   * discovery and model resolution both go through the methods above, which apply the
   * attribution filter. Do not enumerate models through this.
   */
  readonly runtime: ModelRuntime;
};

async function missing(file: string): Promise<boolean> {
  try {
    await access(file, constants.R_OK);
    return false;
  } catch {
    return true;
  }
}

/**
 * Open the application's own model configuration.
 *
 * The whole answer to "which models can this application use" is a function of
 * `configDir` and nothing else, which is what makes it testable: point it at a fixture
 * directory and the result is fixed, whatever the machine running the test has
 * installed or exported.
 */
export async function openModelConfiguration(configDir: string): Promise<ModelConfiguration> {
  const paths = {
    models: path.join(configDir, 'models.json'),
    auth: path.join(configDir, 'auth.json'),
  };
  const runtime = await ModelRuntime.create({
    modelsPath: paths.models,
    authPath: paths.auth,
    // The catalog store is the application's too; it must not be written next to
    // somebody else's models.json.
    modelsStorePath: path.join(configDir, 'models-store.json'),
  });

  const ours = (providerId: string) => {
    const status = runtime.getProviderAuthStatus(providerId);
    return status.configured && OWN_CREDENTIAL_SOURCES.has(status.source ?? '');
  };

  /**
   * A working picker is not a place for warnings: only a real load or composition error
   * is reported while models are on offer. An empty picker, on the other hand, always
   * owes the operator a reason — that is the whole point of carrying a diagnosis.
   */
  const explain = async (offered: number): Promise<string | undefined> => {
    const reasons: string[] = [];
    const error = runtime.getError();
    if (error) reasons.push(error);
    if (offered > 0) return reasons.length ? reasons.join('\n') : undefined;

    // `auth.json` is created by the SDK when the configuration is opened, so its
    // existence proves nothing; whether it holds a credential does.
    const [noModels, credentials] = await Promise.all([
      missing(paths.models),
      runtime.listCredentials().catch(() => []),
    ]);
    if (noModels) reasons.push(`未找到 models.json：${paths.models}`);
    if (!credentials.length) reasons.push(`auth.json 里没有任何凭证：${paths.auth}`);
    if (!reasons.length) {
      // Both files are present, parseable and non-empty, so name the likeliest cause
      // rather than leaving the operator with a blank list.
      const foreign = runtime.getProviders()
        .map((provider) => provider.id)
        .filter((id) => runtime.getProviderAuthStatus(id).configured && !ours(id));
      reasons.push(foreign.length
        ? `models.json 里的 provider 都没有在 auth.json 中配置凭证。${
          foreign.join('、')} 的凭证来自本机环境而非本应用的配置，已按 ADR-0010 忽略。`
        : 'models.json 里的 provider 都没有在 auth.json 中配置凭证。');
    }
    return reasons.length ? reasons.join('\n') : undefined;
  };

  return {
    paths,
    runtime,

    async listAvailable() {
      let available: readonly Model[] = [];
      let failure: string | undefined;
      try {
        available = await runtime.getAvailable();
      } catch (error) {
        failure = error instanceof Error ? error.message : String(error);
      }
      const models = available
        .filter((model) => ours(model.provider))
        .map((model) => ({
          providerId: model.provider,
          modelId: model.id,
          // Pi fills `name` with the id when the catalog declares none, and a name equal
          // to the id carries nothing the id does not already say.
          ...(model.name && model.name !== model.id ? { name: model.name } : {}),
        }));
      const diagnosis = await explain(models.length);
      return {
        models,
        ...(failure ?? diagnosis ? { diagnosis: [failure, diagnosis].filter(Boolean).join('\n') } : {}),
      };
    },

    async resolve(providerId: string, modelId: string) {
      if (!ours(providerId)) {
        throw new Error(
          `provider 不可用：${providerId}。它的凭证不在 ${paths.auth} 里。`);
      }
      const model = runtime.getModel(providerId, modelId);
      if (!model) throw new Error(`模型不存在：${providerId}/${modelId}`);
      return model;
    },
  };
}
