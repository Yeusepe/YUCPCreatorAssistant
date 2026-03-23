import { describe, expect, it } from 'vitest';
import { internal } from './_generated/api';
import { makeTestConvex } from './testHelpers';

describe('role_rules schema compatibility', () => {
  it('accepts legacy sourceGuildName metadata on role rules until migration removes it', async () => {
    const t = makeTestConvex();
    const now = Date.now();

    const guildLinkId = await t.run(async (ctx) =>
      ctx.db.insert('guild_links', {
        authUserId: 'auth-role-rule-legacy',
        discordGuildId: 'guild-role-rule-legacy',
        installedByAuthUserId: 'auth-role-rule-legacy',
        botPresent: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert('role_rules', {
        authUserId: 'auth-role-rule-legacy',
        guildId: 'guild-role-rule-legacy',
        guildLinkId,
        productId: 'discord_role:source-guild-legacy:required-role-legacy',
        verifiedRoleId: 'verified-role-legacy',
        removeOnRevoke: true,
        priority: 0,
        enabled: true,
        sourceGuildId: 'source-guild-legacy',
        sourceGuildName: 'Legacy Source Guild',
        requiredRoleId: 'required-role-legacy',
        createdAt: now,
        updatedAt: now,
      })
    );

    const stored = await t.run(async (ctx) => ctx.db.get(id));

    expect(stored?.sourceGuildName).toBe('Legacy Source Guild');
  });

  it('removes legacy sourceGuildName metadata from role rules via migration', async () => {
    const t = makeTestConvex();
    const now = Date.now();

    const guildLinkId = await t.run(async (ctx) =>
      ctx.db.insert('guild_links', {
        authUserId: 'auth-role-rule-migration',
        discordGuildId: 'guild-role-rule-migration',
        installedByAuthUserId: 'auth-role-rule-migration',
        botPresent: true,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
    );

    const id = await t.run(async (ctx) =>
      ctx.db.insert('role_rules', {
        authUserId: 'auth-role-rule-migration',
        guildId: 'guild-role-rule-migration',
        guildLinkId,
        productId: 'discord_role:source-guild-migration:required-role-migration',
        verifiedRoleId: 'verified-role-migration',
        removeOnRevoke: true,
        priority: 0,
        enabled: true,
        sourceGuildId: 'source-guild-migration',
        sourceGuildName: 'Migrated Source Guild',
        requiredRoleId: 'required-role-migration',
        createdAt: now,
        updatedAt: now,
      })
    );

    const result = await t.run(async (ctx) =>
      ctx.runMutation(internal.migrations.purgeRoleRuleSourceGuildNames, {})
    );
    const stored = await t.run(async (ctx) => ctx.db.get(id));

    expect(result).toEqual({ updated: 1 });
    expect(stored?.sourceGuildName).toBeUndefined();
  });
});
