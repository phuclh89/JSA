import { randomUUID } from 'node:crypto';
import { AndFilter, Client, EqualityFilter } from 'ldapts';
import oracledb from 'oracledb';
import { connectionConfig } from './migration-core.js';
import { loadDatabaseEnvironment } from './oracle-runtime.js';

loadDatabaseEnvironment();

const username = (process.env.SEED_LDAP_ADMIN_USERNAME ?? 'phuclh').trim();
const actor = `ldap-admin-seed:${username}`;
const sequences = {
  user: 'SEQ_SYS_USER',
  role: 'SEQ_SYS_USER_ROLE',
  scope: 'SEQ_SYS_USER_DATA_SCOPE',
  audit: 'SEQ_SYS_ACCESS_ADMIN_AUDIT',
} as const;

interface DirectoryIdentity {
  identityKey: string;
  username: string;
  displayName: string;
  email?: string;
}

interface ExistingUser {
  USER_ID: string;
  ENTERPRISE_IDENTITY_KEY: string;
  USERNAME: string;
  DISPLAY_NAME: string;
  EMAIL?: string;
  IS_ACTIVE: 'Y' | 'N';
}

const required = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required LDAP admin seed configuration: ${name}`);
  return value;
};

async function directoryIdentity(): Promise<DirectoryIdentity> {
  if (!username) throw new Error('SEED_LDAP_ADMIN_USERNAME must not be empty');
  const host = required('LDAP_HOST');
  const port = Number(process.env.LDAP_PORT ?? 389);
  const tlsMode = process.env.LDAP_TLS_MODE ?? 'STARTTLS';
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('LDAP_PORT must be a valid TCP port');
  if (!['LDAPS', 'STARTTLS', 'NONE'].includes(tlsMode))
    throw new Error('LDAP_TLS_MODE must be LDAPS, STARTTLS, or NONE');
  if (process.env.NODE_ENV === 'production' && tlsMode === 'NONE')
    throw new Error('Unencrypted LDAP is forbidden in production');
  const legacyTlsCompatibility = process.env.LDAP_TLS_LEGACY_COMPATIBILITY === 'true';
  if (process.env.NODE_ENV === 'production' && legacyTlsCompatibility)
    throw new Error('Legacy insecure LDAP TLS compatibility is forbidden in production');

  const usernameAttribute = process.env.LDAP_USERNAME_ATTRIBUTE ?? 'sAMAccountName';
  const displayNameAttribute = process.env.LDAP_DISPLAY_NAME_ATTRIBUTE ?? 'displayName';
  const emailAttribute = process.env.LDAP_EMAIL_ATTRIBUTE ?? 'mail';
  const identityAttribute = process.env.LDAP_IDENTITY_ATTRIBUTE ?? 'objectGUID';
  for (const [name, value] of Object.entries({
    LDAP_USERNAME_ATTRIBUTE: usernameAttribute,
    LDAP_DISPLAY_NAME_ATTRIBUTE: displayNameAttribute,
    LDAP_EMAIL_ATTRIBUTE: emailAttribute,
    LDAP_IDENTITY_ATTRIBUTE: identityAttribute,
  }))
    if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(value))
      throw new Error(`${name} is not a valid LDAP attribute name`);

  const client = new Client({
    url: `${tlsMode === 'LDAPS' ? 'ldaps' : 'ldap'}://${host}:${port}`,
    connectTimeout: Number(process.env.LDAP_CONNECT_TIMEOUT_MS ?? 5000),
    timeout: Number(process.env.LDAP_OPERATION_TIMEOUT_MS ?? 10000),
    ...(legacyTlsCompatibility
      ? {
          tlsOptions: {
            minVersion: 'TLSv1',
            ciphers: 'DEFAULT:@SECLEVEL=0',
            rejectUnauthorized: false,
          } as const,
        }
      : {}),
  });
  try {
    if (tlsMode === 'STARTTLS') await client.startTLS();
    await client.bind(required('LDAP_BIND_DN'), required('LDAP_BIND_PASSWORD'));
    const result = await client.search(required('LDAP_SEARCH_BASE'), {
      scope: 'sub',
      filter: new AndFilter({
        filters: [
          new EqualityFilter({ attribute: 'objectCategory', value: 'person' }),
          new EqualityFilter({ attribute: usernameAttribute, value: username }),
        ],
      }),
      attributes: [usernameAttribute, displayNameAttribute, emailAttribute, identityAttribute],
      explicitBufferAttributes: [identityAttribute],
      sizeLimit: 2,
    });
    if (result.searchEntries.length !== 1)
      throw new Error('LDAP admin seed requires exactly one matching directory user');
    const entry = result.searchEntries[0]!;
    const canonicalUsername = text(entry[usernameAttribute]);
    const displayName = text(entry[displayNameAttribute]);
    const guid = entry[identityAttribute];
    if (!canonicalUsername || !displayName || !Buffer.isBuffer(guid))
      throw new Error('The directory user is missing username, display name, or objectGUID');
    const email = text(entry[emailAttribute]);
    return {
      identityKey: `ad-object-guid:${formatObjectGuid(guid)}`,
      username: canonicalUsername,
      displayName,
      ...(email ? { email } : {}),
    };
  } finally {
    await client.unbind().catch(() => undefined);
  }
}

async function nextId(
  connection: oracledb.Connection,
  sequence: (typeof sequences)[keyof typeof sequences],
): Promise<string> {
  const result = await connection.execute<{ ID_VALUE: string }>(
    `SELECT TO_CHAR(${sequence}.NEXTVAL) ID_VALUE FROM DUAL`,
    {},
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  const value = result.rows?.[0]?.ID_VALUE;
  if (!value) throw new Error(`Could not allocate an ID from ${sequence}`);
  return value;
}

async function currentSiteId(connection: oracledb.Connection): Promise<string> {
  const configured = process.env.LOCAL_SITE_ID?.trim();
  const result = await connection.execute<{ SITE_ID: string }>(
    `SELECT TO_CHAR(SITE_ID) SITE_ID
     FROM SYS_SITE
     WHERE IS_ACTIVE='Y' AND (:siteId IS NULL OR SITE_ID=:siteId)
     ORDER BY SITE_ID`,
    { siteId: configured || null },
    { outFormat: oracledb.OUT_FORMAT_OBJECT },
  );
  if (result.rows?.length !== 1)
    throw new Error(
      configured
        ? 'LOCAL_SITE_ID does not identify exactly one active Site'
        : 'Set LOCAL_SITE_ID because the database does not contain exactly one active Site',
    );
  return result.rows[0]!.SITE_ID;
}

async function seed(): Promise<void> {
  const identity = await directoryIdentity();
  const connection = await oracledb.getConnection(connectionConfig());
  try {
    const siteId = await currentSiteId(connection);
    const role = await connection.execute<{ ROLE_ID: string }>(
      `SELECT TO_CHAR(ROLE_ID) ROLE_ID FROM SYS_ROLE
       WHERE ROLE_CODE='SYSTEM_ADMIN' AND IS_ACTIVE='Y'`,
      {},
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if (role.rows?.length !== 1)
      throw new Error('Exactly one active SYSTEM_ADMIN role is required');
    const roleId = role.rows[0]!.ROLE_ID;

    const users = await connection.execute<ExistingUser>(
      `SELECT TO_CHAR(USER_ID) USER_ID,ENTERPRISE_IDENTITY_KEY,USERNAME,DISPLAY_NAME,EMAIL,IS_ACTIVE
       FROM SYS_USER
       WHERE UPPER(USERNAME)=UPPER(:username)
          OR UPPER(ENTERPRISE_IDENTITY_KEY)=UPPER(:identityKey)
       FOR UPDATE`,
      { username: identity.username, identityKey: identity.identityKey },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    if ((users.rows?.length ?? 0) > 1)
      throw new Error('Conflicting SYS_USER username and objectGUID mappings were found');

    let userId: string;
    let userChanged = false;
    const existing = users.rows?.[0];
    if (!existing) {
      userId = await nextId(connection, sequences.user);
      await connection.execute(
        `INSERT INTO SYS_USER
         (USER_ID,ENTERPRISE_IDENTITY_KEY,USERNAME,DISPLAY_NAME,EMAIL,DEFAULT_SITE_ID,
          CREATED_SITE_ID,UPDATED_SITE_ID,CREATED_BY,UPDATED_BY)
         VALUES(:userId,:identityKey,:username,:displayName,:email,:siteId,
          :siteId,:siteId,:actor,:actor)`,
        {
          userId,
          identityKey: identity.identityKey,
          username: identity.username,
          displayName: identity.displayName,
          email: identity.email ?? null,
          siteId,
          actor,
        },
      );
      userChanged = true;
    } else {
      userId = existing.USER_ID;
      const differs =
        existing.ENTERPRISE_IDENTITY_KEY !== identity.identityKey ||
        existing.USERNAME !== identity.username ||
        existing.DISPLAY_NAME !== identity.displayName ||
        (existing.EMAIL ?? null) !== (identity.email ?? null) ||
        existing.IS_ACTIVE !== 'Y';
      if (differs) {
        await connection.execute(
          `UPDATE SYS_USER
           SET ENTERPRISE_IDENTITY_KEY=:identityKey,USERNAME=:username,
               DISPLAY_NAME=:displayName,EMAIL=:email,DEFAULT_SITE_ID=:siteId,
               IS_ACTIVE='Y',UPDATED_SITE_ID=:siteId,UPDATED_BY=:actor,
               UPDATED_AT=SYSTIMESTAMP,ROW_VERSION=ROW_VERSION+1
           WHERE USER_ID=:userId`,
          {
            identityKey: identity.identityKey,
            username: identity.username,
            displayName: identity.displayName,
            email: identity.email ?? null,
            siteId,
            actor,
            userId,
          },
        );
        userChanged = true;
      }
    }

    const assignment = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_USER_ROLE
       WHERE USER_ID=:userId AND ROLE_ID=:roleId AND IS_ACTIVE='Y'`,
      { userId, roleId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const roleChanged = (assignment.rows?.[0]?.ITEM_COUNT ?? 0) === 0;
    let roleAssignmentId: string | undefined;
    if (roleChanged) {
      roleAssignmentId = await nextId(connection, sequences.role);
      await connection.execute(
        `INSERT INTO SYS_USER_ROLE
         (USER_ROLE_ID,USER_ID,ROLE_ID,CREATED_BY,UPDATED_BY)
         VALUES(:id,:userId,:roleId,:actor,:actor)`,
        { id: roleAssignmentId, userId, roleId, actor },
      );
    }

    const scope = await connection.execute<{ ITEM_COUNT: number }>(
      `SELECT COUNT(*) ITEM_COUNT FROM SYS_USER_DATA_SCOPE
       WHERE USER_ID=:userId AND SCOPE_TYPE='SITE' AND SITE_ID=:siteId
         AND IS_ACTIVE='Y' AND CAN_VIEW='Y' AND CAN_ACT='Y'`,
      { userId, siteId },
      { outFormat: oracledb.OUT_FORMAT_OBJECT },
    );
    const scopeChanged = (scope.rows?.[0]?.ITEM_COUNT ?? 0) === 0;
    let scopeId: string | undefined;
    if (scopeChanged) {
      const conflicting = await connection.execute<{ ITEM_COUNT: number }>(
        `SELECT COUNT(*) ITEM_COUNT FROM SYS_USER_DATA_SCOPE
         WHERE USER_ID=:userId AND SCOPE_TYPE='SITE' AND SITE_ID=:siteId AND IS_ACTIVE='Y'`,
        { userId, siteId },
        { outFormat: oracledb.OUT_FORMAT_OBJECT },
      );
      if ((conflicting.rows?.[0]?.ITEM_COUNT ?? 0) > 0)
        throw new Error(
          'An active Site scope exists without both VIEW and ACT; update it through access administration',
        );
      scopeId = await nextId(connection, sequences.scope);
      await connection.execute(
        `INSERT INTO SYS_USER_DATA_SCOPE
         (USER_DATA_SCOPE_ID,USER_ID,SCOPE_TYPE,SITE_ID,CAN_VIEW,CAN_ACT,
          CREATED_BY,UPDATED_BY)
         VALUES(:id,:userId,'SITE',:siteId,'Y','Y',:actor,:actor)`,
        { id: scopeId, userId, siteId, actor },
      );
    }

    for (const event of [
      ...(userChanged
        ? [
            {
              action: existing ? 'USER_PROFILE_UPDATED' : 'USER_REGISTERED',
              target: 'SYS_USER',
              targetId: userId,
            },
          ]
        : []),
      ...(roleChanged
        ? [{ action: 'ASSIGNMENT_CREATED', target: 'SYS_USER_ROLE', targetId: roleAssignmentId! }]
        : []),
      ...(scopeChanged
        ? [{ action: 'ASSIGNMENT_CREATED', target: 'SYS_USER_DATA_SCOPE', targetId: scopeId! }]
        : []),
    ])
      await connection.execute(
        `INSERT INTO SYS_ACCESS_ADMIN_AUDIT
         (AUDIT_EVENT_ID,ACTION_CODE,TARGET_ENTITY_TYPE,TARGET_ENTITY_ID,
          TARGET_USERNAME_SNAPSHOT,ACTOR_USER_ID,ACTOR_USERNAME_SNAPSHOT,
          ACTOR_DISPLAY_SNAPSHOT,SITE_ID,AFTER_STATE,REASON_TEXT,CORRELATION_ID,CREATED_SITE_ID)
         VALUES(:id,:action,:target,:targetId,:username,:userId,:username,
          :displayName,:siteId,:afterState,:reason,:correlationId,:siteId)`,
        {
          id: await nextId(connection, sequences.audit),
          action: event.action,
          target: event.target,
          targetId: event.targetId,
          userId,
          username: identity.username,
          displayName: identity.displayName,
          siteId,
          afterState: JSON.stringify({ seeded: true, roleCode: 'SYSTEM_ADMIN', scopeType: 'SITE' }),
          reason: 'Approved LDAP administrator seed',
          correlationId: randomUUID(),
        },
      );

    await connection.commit();
    console.log(
      JSON.stringify({
        status: userChanged || roleChanged || scopeChanged ? 'PASS' : 'SKIPPED',
        username: identity.username,
        userId,
        siteId,
        roleCode: 'SYSTEM_ADMIN',
        siteScope: 'VIEW_ACT',
      }),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.close();
  }
}

function text(value: Buffer | Buffer[] | string[] | string | undefined): string | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first === 'string') return first.trim() || undefined;
  if (Buffer.isBuffer(first)) return first.toString('utf8').trim() || undefined;
  return undefined;
}

function formatObjectGuid(value: Buffer): string {
  if (value.length !== 16) return value.toString('base64url');
  const hex = (buffer: Buffer) => buffer.toString('hex');
  return `${hex(Buffer.from(value.subarray(0, 4)).reverse())}-${hex(Buffer.from(value.subarray(4, 6)).reverse())}-${hex(Buffer.from(value.subarray(6, 8)).reverse())}-${hex(value.subarray(8, 10))}-${hex(value.subarray(10, 16))}`;
}

seed().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
