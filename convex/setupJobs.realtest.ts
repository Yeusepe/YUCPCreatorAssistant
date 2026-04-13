import { beforeEach, describe, expect, it } from 'vitest';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { makeTestConvex } from './testHelpers';

const API_SECRET = 'test-secret';

async function seedGuildLink(
  t: ReturnType<typeof makeTestConvex>,
  args: {
    authUserId: string;
    discordGuildId?: string;
  }
): Promise<Id<'guild_links'>> {
  return t.run(async (ctx) => {
    const now = Date.now();
    return ctx.db.insert('guild_links', {
      authUserId: args.authUserId,
      discordGuildId: args.discordGuildId ?? `guild-${now}`,
      installedByAuthUserId: args.authUserId,
      botPresent: true,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  });
}

describe('setup jobs orchestration', () => {
  beforeEach(() => {
    process.env.CONVEX_API_SECRET = API_SECRET;
  });

  it('creates a durable automatic setup job with the doc-aligned default steps', async () => {
    const t = makeTestConvex();
    const authUserId = 'auth-setup-create';
    const guildLinkId = await seedGuildLink(t, {
      authUserId,
      discordGuildId: 'guild-setup-create',
    });

    const result = await t.mutation(api.setupJobs.createOrResumeSetupJobForOwner, {
      apiSecret: API_SECRET,
      authUserId,
      guildLinkId,
      mode: 'automatic_setup',
      triggerSource: 'discord_autosetup',
    });

    expect(result.created).toBe(true);

    const { job, steps, recommendations, auditEvents } = await t.run(async (ctx) => {
      const job = await ctx.db.get(result.setupJobId);
      const steps = await ctx.db
        .query('setup_job_steps')
        .withIndex('by_setup_job', (q) => q.eq('setupJobId', result.setupJobId))
        .order('asc')
        .collect();
      const recommendations = await ctx.db
        .query('setup_recommendations')
        .withIndex('by_setup_job', (q) => q.eq('setupJobId', result.setupJobId))
        .collect();
      const auditEvents = await ctx.db
        .query('audit_events')
        .withIndex('by_auth_user_event', (q) =>
          q.eq('authUserId', authUserId).eq('eventType', 'setup.job.created')
        )
        .collect();
      return { job, steps, recommendations, auditEvents };
    });

    expect(job).toMatchObject({
      authUserId,
      guildLinkId,
      discordGuildId: 'guild-setup-create',
      mode: 'automatic_setup',
      triggerSource: 'discord_autosetup',
      status: 'running',
      currentPhase: 'connect_store',
      activeStepKey: 'connect-store',
    });
    expect(steps.map((step) => step.stepKey)).toEqual([
      'connect-store',
      'scan-server',
      'generate-plan',
      'review-exceptions',
      'apply-setup',
      'shadow-migration',
      'confirm-cutover',
    ]);
    expect(steps[0]?.status).toBe('in_progress');
    expect(steps.slice(1).every((step) => step.status === 'pending')).toBe(true);
    expect(recommendations).toHaveLength(3);
    expect(recommendations.map((recommendation) => recommendation.recommendationType)).toEqual([
      'provider_connection',
      'role_creation',
      'verify_surface_creation',
    ]);
    expect(auditEvents).toHaveLength(1);
  });

  it('resumes an active setup job instead of creating a duplicate', async () => {
    const t = makeTestConvex();
    const authUserId = 'auth-setup-resume';
    const guildLinkId = await seedGuildLink(t, {
      authUserId,
      discordGuildId: 'guild-setup-resume',
    });

    const first = await t.mutation(api.setupJobs.createOrResumeSetupJobForOwner, {
      apiSecret: API_SECRET,
      authUserId,
      guildLinkId,
      mode: 'automatic_setup',
      triggerSource: 'dashboard',
    });
    const second = await t.mutation(api.setupJobs.createOrResumeSetupJobForOwner, {
      apiSecret: API_SECRET,
      authUserId,
      guildLinkId,
      mode: 'automatic_setup',
      triggerSource: 'discord_setup',
    });

    expect(first.created).toBe(true);
    expect(second).toEqual({
      setupJobId: first.setupJobId,
      created: false,
    });

    const { jobs, resumeEvents } = await t.run(async (ctx) => {
      const jobs = await ctx.db
        .query('setup_jobs')
        .withIndex('by_guild_link', (q) => q.eq('guildLinkId', guildLinkId))
        .collect();
      const resumeEvents = await ctx.db
        .query('audit_events')
        .withIndex('by_auth_user_event', (q) =>
          q.eq('authUserId', authUserId).eq('eventType', 'setup.job.resumed')
        )
        .collect();
      return { jobs, resumeEvents };
    });

    expect(jobs).toHaveLength(1);
    expect(resumeEvents).toHaveLength(1);
  });

  it('creates a linked migration job for the same guild and setup job', async () => {
    const t = makeTestConvex();
    const authUserId = 'auth-migration-create';
    const guildLinkId = await seedGuildLink(t, {
      authUserId,
      discordGuildId: 'guild-migration-create',
    });

    const { setupJobId } = await t.mutation(api.setupJobs.createOrResumeSetupJobForOwner, {
      apiSecret: API_SECRET,
      authUserId,
      guildLinkId,
      mode: 'automatic_setup',
      triggerSource: 'dashboard',
    });

    const result = await t.mutation(api.setupJobs.createMigrationJobForOwner, {
      apiSecret: API_SECRET,
      authUserId,
      guildLinkId,
      setupJobId,
      mode: 'adopt_existing_roles',
      sourceBotKey: 'legacy-bot',
    });

    const migrationJob = await t.run(async (ctx) => ctx.db.get(result.migrationJobId));
    expect(migrationJob).toMatchObject({
      authUserId,
      guildLinkId,
      setupJobId,
      discordGuildId: 'guild-migration-create',
      mode: 'adopt_existing_roles',
      status: 'running',
      currentPhase: 'analyze',
      sourceBotKey: 'legacy-bot',
    });
  });

  it('loads and resumes a setup job through the guild-scoped entrypoints', async () => {
    const t = makeTestConvex();
    const authUserId = 'auth-setup-guild-scope';
    await seedGuildLink(t, {
      authUserId,
      discordGuildId: 'guild-setup-guild-scope',
    });

    const created = await t.mutation(api.setupJobs.createOrResumeSetupJobForOwnerByGuild, {
      apiSecret: API_SECRET,
      authUserId,
      guildId: 'guild-setup-guild-scope',
      mode: 'automatic_setup',
      triggerSource: 'dashboard',
    });

    const detail = await t.query(api.setupJobs.getSetupJobForOwnerByGuild, {
      apiSecret: API_SECRET,
      authUserId,
      guildId: 'guild-setup-guild-scope',
    });

    expect(detail?.job.id).toBe(created.setupJobId);
    expect(detail?.job.discordGuildId).toBe('guild-setup-guild-scope');
    expect(detail?.steps).toHaveLength(7);
  });
});
