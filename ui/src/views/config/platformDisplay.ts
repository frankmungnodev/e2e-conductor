import type { ConfigMeta, EnvPlatformRecord, PlatformRecord, PlatformWithEnvOverrides } from "../../types.ts"

/** Project platforms with the selected environment's overrides applied and the overridden fields listed. */
export function buildDisplayPlatforms(
  config: ConfigMeta | null,
  allEnvPlatforms: EnvPlatformRecord[],
  selectedEnvName: string,
): PlatformWithEnvOverrides[] {
  const basePlatforms: PlatformRecord[] =
    config?.platforms && config.platforms.length > 0
      ? config.platforms
      : Object.entries(config?.targets ?? {}).map(([name, target], idx) => {
          const platId = `plat-${name}`
          const srv = config?.services?.[target.service]
          return {
            id: platId,
            name,
            type: target.driver === "mobile" ? "android" : target.driver === "web" ? "web" : "api",
            orderNum: idx + 1,
            url: srv?.url,
            serviceName: target.service,
            health: srv?.health,
            startCmd: srv?.startCmd,
            cwd: srv?.startCwd,
            modules: target.modules,
            slowMo: target.slowMo,
            headless: target.headless,
            exclusive: srv?.exclusive,
            appId: target.appId,
            flows: target.flows,
            installCmd: target.install?.cmd,
            grantPermissions: target.grantPermissions,
            reversePorts: target.reversePorts,
          }
        })

  return basePlatforms.map((p) => {
    const pivot = allEnvPlatforms.find(
      (ep) => ep.envName === selectedEnvName && ep.platformId === p.id,
    )
    const overriddenFields: string[] = []
    let effectiveUrl = p.url
    if (pivot && pivot.url !== undefined && pivot.url !== null) {
      effectiveUrl = pivot.url
      if (pivot.url !== p.url) overriddenFields.push("url")
    }

    let effectiveHealth = p.health
    if (pivot && pivot.health !== undefined && pivot.health !== null) {
      effectiveHealth = pivot.health
      if (pivot.health !== p.health) overriddenFields.push("health")
    }

    let effectiveStartCmd = p.startCmd
    if (pivot && pivot.startCmd !== undefined) {
      effectiveStartCmd = pivot.startCmd || undefined
      if (pivot.startCmd !== p.startCmd) overriddenFields.push("startCmd")
    }

    let effectiveCwd = p.cwd
    if (pivot && pivot.cwd !== undefined && pivot.cwd !== null) {
      effectiveCwd = pivot.cwd
      if (pivot.cwd !== p.cwd) overriddenFields.push("cwd")
    }

    let effectiveHeadless = p.headless
    if (pivot && pivot.headless !== undefined && pivot.headless !== null) {
      effectiveHeadless = pivot.headless
      if (pivot.headless !== p.headless) overriddenFields.push("headless")
    }

    let effectiveSlowMo = p.slowMo
    if (pivot && pivot.slowMo !== undefined && pivot.slowMo !== null) {
      effectiveSlowMo = pivot.slowMo
      if (pivot.slowMo !== p.slowMo) overriddenFields.push("slowMo")
    }

    let effectiveAppId = p.appId
    if (pivot && pivot.appId !== undefined && pivot.appId !== null) {
      effectiveAppId = pivot.appId
      if (pivot.appId !== p.appId) overriddenFields.push("appId")
    }

    return {
      ...p,
      url: effectiveUrl,
      health: effectiveHealth,
      startCmd: effectiveStartCmd,
      cwd: effectiveCwd,
      headless: effectiveHeadless,
      slowMo: effectiveSlowMo,
      appId: effectiveAppId,
      envName: selectedEnvName,
      enabled: pivot ? pivot.enabled : true,
      isLinked: Boolean(pivot),
      hasOverrides: overriddenFields.length > 0,
      overriddenFields,
    } as PlatformWithEnvOverrides
  })
}
