# 16. v2 Prisma / DDL Draft

이 문서는 **에디터 완성 phase**에서 필요한 저장 계층을 실제 구현 가능한 수준으로 내립니다.

## 1. 목적

현재 phase의 목표는 아래 네 가지입니다.

- 플랫폼 운영 데이터와 에디터 문서 데이터를 분리
- 에디터 저장 / 버전 / 협업 / publish snapshot의 핵심 테이블 고정
- unique / foreign key / index 규칙 고정
- migration 순서 고정

이번 phase에서 다루지 않는 것:

- 앱 내부 사용자 도메인 전체
- 결제/정산/보증금/에스크로
- 메신저 / 커뮤니티 / 마켓플레이스 도메인 DDL

## 2. 기본 원칙

### 2.1 경계 분리

- control plane: NULL 플랫폼 운영 데이터
- editor data plane: 문서 / 버전 / 협업 / publish 데이터

권장 prefix:

- `cp_*`
- `ed_*`

### 2.2 id 규칙

- 외부 노출 id는 문자열 기반
- `cuid()` 또는 uuid v7 계열 사용
- bigint autoincrement를 기본 키로 쓰지 않음

### 2.3 공통 audit 필드

거의 모든 테이블:

- `created_at`
- `updated_at`
- `deleted_at nullable`

## 3. Control Plane 모델

필수 모델:

- `cp_platform_user`
- `cp_platform_identity`
- `cp_platform_session`
- `cp_workspace`
- `cp_workspace_member`
- `cp_project`
- `cp_project_environment`
- `cp_deployment`
- `cp_release_snapshot`
- `cp_audit_event`

### 3.1 Prisma 초안

```prisma
model CpPlatformUser {
  id            String              @id @default(cuid())
  email         String              @unique
  passwordHash  String?
  displayName   String?
  status        String              @default("active")
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
  deletedAt     DateTime?

  identities    CpPlatformIdentity[]
  sessions      CpPlatformSession[]
  memberships   CpWorkspaceMember[]
  projectsOwned CpProject[]         @relation("CpProjectOwner")
}

model CpPlatformIdentity {
  id             String         @id @default(cuid())
  platformUserId String
  provider       String
  providerUserId String
  createdAt      DateTime       @default(now())

  platformUser   CpPlatformUser @relation(fields: [platformUserId], references: [id], onDelete: Cascade)

  @@unique([provider, providerUserId])
  @@index([platformUserId])
}

model CpPlatformSession {
  id             String         @id @default(cuid())
  platformUserId String
  tokenHash      String         @unique
  expiresAt      DateTime
  createdAt      DateTime       @default(now())
  revokedAt      DateTime?
  ipHash         String?
  userAgent      String?

  platformUser   CpPlatformUser @relation(fields: [platformUserId], references: [id], onDelete: Cascade)

  @@index([platformUserId, expiresAt])
}

model CpWorkspace {
  id          String              @id @default(cuid())
  name        String
  slug        String              @unique
  status      String              @default("active")
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  deletedAt   DateTime?

  members     CpWorkspaceMember[]
  projects    CpProject[]
}

model CpWorkspaceMember {
  id             String         @id @default(cuid())
  workspaceId    String
  platformUserId String
  role           String
  createdAt      DateTime       @default(now())

  workspace      CpWorkspace    @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  platformUser   CpPlatformUser @relation(fields: [platformUserId], references: [id], onDelete: Cascade)

  @@unique([workspaceId, platformUserId])
  @@index([platformUserId])
}

model CpProject {
  id             String                 @id @default(cuid())
  workspaceId    String
  ownerUserId    String
  name           String
  slug           String
  status         String                 @default("draft")
  createdAt      DateTime               @default(now())
  updatedAt      DateTime               @updatedAt
  deletedAt      DateTime?

  workspace      CpWorkspace            @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  owner          CpPlatformUser         @relation("CpProjectOwner", fields: [ownerUserId], references: [id], onDelete: Restrict)
  environments   CpProjectEnvironment[]
  deployments    CpDeployment[]

  @@unique([workspaceId, slug])
  @@index([ownerUserId])
}
```

## 4. Editor Data Plane 모델

필수 모델:

- `ed_document`
- `ed_document_version`
- `ed_comment_thread`
- `ed_comment`
- `ed_presence_session`
- `ed_asset`
- `ed_publish_snapshot`
- `ed_validation_report`

### 4.1 Prisma 초안

```prisma
model EdDocument {
  id               String   @id @default(cuid())
  projectId        String
  environmentId    String
  key              String
  title            String
  schemaVersion    Int
  sceneDocJson     Json
  runtimeGraphJson Json?
  lastEditorUserId String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([environmentId, key])
  @@index([projectId, environmentId, updatedAt])
}

model EdDocumentVersion {
  id               String   @id @default(cuid())
  documentId       String
  versionNo        Int
  sceneDocJson     Json
  runtimeGraphJson Json?
  actorUserId      String
  kind             String
  createdAt        DateTime @default(now())

  @@unique([documentId, versionNo])
  @@index([documentId, createdAt])
}

model EdCommentThread {
  id               String   @id @default(cuid())
  documentId       String
  pageId           String?
  nodeId           String?
  status           String   @default("open")
  createdByUserId  String
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([documentId, status, updatedAt])
}

model EdComment {
  id               String   @id @default(cuid())
  threadId         String
  authorUserId     String
  body             String
  createdAt        DateTime @default(now())
  editedAt         DateTime?
  deletedAt        DateTime?

  @@index([threadId, createdAt])
}

model EdPresenceSession {
  id               String   @id @default(cuid())
  documentId       String
  platformUserId   String
  connectionId     String   @unique
  viewportJson     Json?
  cursorJson       Json?
  selectionJson    Json?
  lastSeenAt       DateTime
  expiresAt        DateTime

  @@index([documentId, expiresAt])
  @@index([platformUserId, expiresAt])
}

model EdAsset {
  id               String   @id @default(cuid())
  projectId        String
  documentId       String?
  kind             String
  storageKey       String
  mimeType         String
  metadataJson     Json?
  createdByUserId  String
  createdAt        DateTime @default(now())

  @@index([projectId, createdAt])
  @@index([documentId, createdAt])
}

model EdPublishSnapshot {
  id               String   @id @default(cuid())
  documentId       String
  projectId        String
  environmentId    String
  schemaVersion    Int
  sceneDocJson     Json
  runtimeGraphJson Json?
  validationJson   Json?
  createdByUserId  String
  createdAt        DateTime @default(now())

  @@index([documentId, createdAt])
  @@index([projectId, environmentId, createdAt])
}

model EdValidationReport {
  id                String   @id @default(cuid())
  documentId        String
  documentVersionId String?
  severity          String
  code              String
  message           String
  targetKind        String?
  targetId          String?
  createdAt         DateTime @default(now())

  @@index([documentId, severity, createdAt])
}
```

## 5. 필수 인덱스 규칙

- session token unique
- `(projectId, environmentId, updatedAt)` document listing index
- `(documentId, createdAt)` version hot path index
- `(documentId, expiresAt)` presence expiry index
- `(documentId, status, updatedAt)` comment thread index
- `(projectId, environmentId, createdAt)` publish snapshot index

## 6. referential action 원칙

- session / identity / membership: `Cascade`
- document version / comment / presence / asset: document/project 기준 `Cascade` 또는 soft delete 정책 병행
- publish snapshot / audit event: hard delete 지양

## 7. migration 순서

### Phase 1

- control plane 핵심
- document / document_version

### Phase 2

- comment / presence / asset

### Phase 3

- publish snapshot
- validation report
- audit / plugin installation

## 8. 구현 규칙

- enum은 초기엔 string 우선
- 환경 경계 모델은 `environmentId` index 필수
- slug/key는 scope unique
- partial index와 deleted_at 전략은 migration SQL에서 직접 검토

## 9. 최종 결론

이 문서 기준으로 현재 phase의 저장 계층은  
**에디터 문서/버전/협업/publish를 구현할 수 있는 Prisma schema 초안 수준**까지 내려와 있습니다.
