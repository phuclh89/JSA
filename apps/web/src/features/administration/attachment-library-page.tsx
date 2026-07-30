import {
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileWordOutlined,
  FolderAddOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  HomeOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttachmentLibraryAsset,
  AttachmentLibraryFolder,
  OrganizationOption,
} from '@jsams/shared-types';
import {
  Alert,
  Breadcrumb,
  Button,
  Card,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Spin,
  Tag,
  Tree,
  Typography,
  Upload,
} from 'antd';
import { useEffect, useMemo, useState } from 'react';
import type { ApiClientError } from '../../services/api-client';
import { apiClient } from '../../services/api-client';
import './administration.css';

interface LibraryResponse {
  folders: AttachmentLibraryFolder[];
  assets: AttachmentLibraryAsset[];
}

interface ExplorerTreeNode {
  key: string;
  title: string;
  icon: React.ReactNode;
  children?: ExplorerTreeNode[];
}

const departmentKey = (id: string) => `department:${id}`;
const folderKey = (id: string) => `folder:${id}`;

export function AttachmentLibraryPage() {
  const client = useQueryClient();
  const [siteId, setSiteId] = useState<string>();
  const [rigId, setRigId] = useState<string>();
  const [selectedKey, setSelectedKey] = useState<string>();
  const [search, setSearch] = useState('');
  const [folderOpen, setFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceAsset, setReplaceAsset] = useState<AttachmentLibraryAsset>();
  const [file, setFile] = useState<File>();
  const [folderForm] = Form.useForm();
  const [assetForm] = Form.useForm();

  const sites = useScopeOptions('SITE');
  const rigs = useScopeOptions('RIG', siteId);
  const departments = useScopeOptions('DEPARTMENT', siteId, rigId);
  const scopeReady = Boolean(siteId && rigId);
  const departmentItems = useMemo(() => departments.data ?? [], [departments.data]);
  const departmentLibraries = useQueries({
    queries: departmentItems.map((department) => ({
      queryKey: ['attachment-library', siteId, rigId, department.id],
      queryFn: () =>
        apiClient.get<LibraryResponse>(
          `/attachment-library?siteId=${siteId}&rigId=${rigId}&departmentId=${department.id}`,
        ),
      enabled: scopeReady,
    })),
  });
  const folders = useMemo(
    () => departmentLibraries.flatMap((query) => query.data?.folders ?? []),
    [departmentLibraries],
  );
  const assets = useMemo(
    () => departmentLibraries.flatMap((query) => query.data?.assets ?? []),
    [departmentLibraries],
  );
  const selectedFolder = selectedKey?.startsWith('folder:')
    ? folders.find((item) => item.id === selectedKey.slice('folder:'.length))
    : undefined;
  const selectedDepartmentId = selectedFolder
    ? selectedFolder.departmentId
    : selectedKey?.startsWith('department:')
      ? selectedKey.slice('department:'.length)
      : undefined;
  const selectedDepartment = departmentItems.find((item) => item.id === selectedDepartmentId);
  const loading = departments.isLoading || departmentLibraries.some((query) => query.isLoading);
  const libraryError = departmentLibraries.find((query) => query.error)?.error;
  const error = libraryError ?? departments.error;

  useEffect(() => {
    if (!selectedKey && departmentItems[0]) setSelectedKey(departmentKey(departmentItems[0].id));
  }, [departmentItems, selectedKey]);

  const treeData = useMemo(
    () =>
      departmentItems.map((department) => ({
        key: departmentKey(department.id),
        title: `${department.code} — ${department.name}`,
        icon: <HomeOutlined />,
        children: buildFolderTree(
          folders.filter((folder) => folder.departmentId === department.id && folder.active),
        ),
      })),
    [departmentItems, folders],
  );
  const childFolders = folders.filter(
    (folder) =>
      folder.active &&
      folder.departmentId === selectedDepartmentId &&
      (selectedFolder ? folder.parentFolderId === selectedFolder.id : !folder.parentFolderId),
  );
  const currentAssets = selectedFolder
    ? assets.filter((asset) => asset.folderId === selectedFolder.id)
    : [];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleFolders = childFolders.filter((folder) =>
    folder.name.toLocaleLowerCase().includes(normalizedSearch),
  );
  const visibleAssets = currentAssets.filter((asset) =>
    `${asset.name} ${asset.originalFileName}`.toLocaleLowerCase().includes(normalizedSearch),
  );
  const currentRig = rigs.data?.find((item) => item.id === rigId);
  const breadcrumbs = buildBreadcrumbs(
    currentRig,
    selectedDepartment,
    selectedFolder,
    folders,
    setSelectedKey,
  );

  const invalidate = () => client.invalidateQueries({ queryKey: ['attachment-library'] });
  const createFolder = useMutation({
    mutationFn: (value: { name: string }) => {
      if (!siteId || !rigId || !selectedDepartmentId)
        throw new Error('Select a Department location in the folder tree');
      return apiClient.post('/attachment-library/folders', {
        siteId,
        rigId,
        departmentId: selectedDepartmentId,
        ...(selectedFolder ? { parentFolderId: selectedFolder.id } : {}),
        ...value,
      });
    },
    onSuccess: () => {
      setFolderOpen(false);
      folderForm.resetFields();
      void invalidate();
    },
  });
  const saveFile = useMutation({
    mutationFn: async (value: { name?: string; description?: string }) => {
      if (!file) throw new Error('Choose a file');
      const formData = new FormData();
      formData.append('file', file);
      if (!replaceAsset) {
        if (!selectedFolder) throw new Error('Select a folder before uploading');
        formData.append('name', value.name?.trim() || file.name);
        if (value.description) formData.append('description', value.description);
        return apiClient.postForm(
          `/attachment-library/folders/${selectedFolder.id}/assets`,
          formData,
        );
      }
      return apiClient.postForm(`/attachment-library/assets/${replaceAsset.id}/versions`, formData);
    },
    onSuccess: () => {
      setUploadOpen(false);
      setReplaceAsset(undefined);
      setFile(undefined);
      assetForm.resetFields();
      void invalidate();
    },
  });
  const operationError = createFolder.error ?? saveFile.error;

  return (
    <section className="admin-page">
      <header className="admin-page-header">
        <div>
          <Typography.Title level={1}>Attachment Library</Typography.Title>
          <Typography.Paragraph type="secondary">
            Browse governed folders and versioned files by Rig. Oracle stores metadata only;
            cross-site binary synchronization is handled outside JSAMS.
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Button
            icon={<FolderAddOutlined />}
            disabled={!selectedDepartmentId}
            onClick={() => setFolderOpen(true)}
          >
            Create folder
          </Button>
          <Button
            type="primary"
            icon={<UploadOutlined />}
            disabled={!selectedFolder}
            onClick={() => {
              setReplaceAsset(undefined);
              setUploadOpen(true);
            }}
          >
            Upload file
          </Button>
        </Space>
      </header>

      <Card className="attachment-scope-card">
        <div className="attachment-scope-grid">
          <Select
            aria-label="Attachment Site"
            placeholder="Select Site"
            value={siteId}
            options={sites.data?.map(toOption)}
            onChange={(value) => {
              setSiteId(value);
              setRigId(undefined);
              setSelectedKey(undefined);
              setSearch('');
            }}
          />
          <Select
            aria-label="Attachment Rig"
            placeholder="Select Rig"
            disabled={!siteId}
            value={rigId}
            options={rigs.data?.map(toOption)}
            onChange={(value) => {
              setRigId(value);
              setSelectedKey(undefined);
              setSearch('');
            }}
          />
        </div>
      </Card>

      {error || operationError ? (
        <Alert
          type="error"
          showIcon
          closable
          message="Attachment Library operation failed"
          description={((error ?? operationError) as ApiClientError).message ?? String(error)}
        />
      ) : null}

      {!scopeReady ? (
        <div className="attachment-explorer-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Select a Site and Rig to browse attachments"
          />
        </div>
      ) : (
        <div className="attachment-explorer" aria-label="Attachment file explorer">
          <aside className="attachment-tree-pane" aria-label="Attachment folders">
            <div className="attachment-pane-heading">
              <Typography.Text strong>Folders</Typography.Text>
              <Typography.Text type="secondary">
                {departmentItems.length} departments
              </Typography.Text>
            </div>
            <Spin spinning={loading}>
              {treeData.length ? (
                <Tree
                  showIcon
                  defaultExpandAll
                  blockNode
                  treeData={treeData}
                  selectedKeys={selectedKey ? [selectedKey] : []}
                  onSelect={(keys) => {
                    const key = keys[0];
                    if (key) {
                      setSelectedKey(String(key));
                      setSearch('');
                    }
                  }}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="No accessible departments"
                />
              )}
            </Spin>
          </aside>

          <main className="attachment-content-pane">
            <div className="attachment-explorer-toolbar">
              <Breadcrumb items={breadcrumbs} />
              <Input
                allowClear
                className="attachment-search"
                aria-label="Filter current folder"
                prefix={<SearchOutlined />}
                placeholder="Filter this folder"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="attachment-content-summary" aria-live="polite">
              <Typography.Text strong>
                {selectedFolder?.name ?? selectedDepartment?.name ?? 'Rig attachments'}
              </Typography.Text>
              <Typography.Text type="secondary">
                {visibleFolders.length} folders · {visibleAssets.length} files
              </Typography.Text>
            </div>
            <Spin spinning={loading}>
              {selectedDepartment && (visibleFolders.length || visibleAssets.length) ? (
                <div className="attachment-item-grid">
                  {visibleFolders.map((folder) => (
                    <button
                      type="button"
                      className="attachment-explorer-item attachment-folder-item"
                      key={folder.id}
                      onClick={() => {
                        setSelectedKey(folderKey(folder.id));
                        setSearch('');
                      }}
                    >
                      <FolderOutlined className="attachment-item-icon" />
                      <span className="attachment-item-name">{folder.name}</span>
                      <span className="attachment-item-meta">Folder</span>
                    </button>
                  ))}
                  {visibleAssets.map((asset) => (
                    <article
                      className="attachment-explorer-item attachment-file-item"
                      key={asset.id}
                    >
                      {fileIcon(asset)}
                      <span className="attachment-item-name" title={asset.name}>
                        {asset.name}
                      </span>
                      <span className="attachment-item-meta" title={asset.originalFileName}>
                        {asset.originalFileName}
                      </span>
                      <Space size={4} wrap>
                        <Tag>v{asset.versionNumber}</Tag>
                        <Tag color={asset.active ? 'green' : 'default'}>
                          {asset.active ? 'Active' : 'Inactive'}
                        </Tag>
                      </Space>
                      <Button
                        size="small"
                        onClick={() => {
                          setReplaceAsset(asset);
                          setSelectedKey(folderKey(asset.folderId));
                          setUploadOpen(true);
                        }}
                      >
                        Replace
                      </Button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="attachment-folder-empty">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      selectedDepartment
                        ? normalizedSearch
                          ? 'No matching folders or files'
                          : 'This folder is empty'
                        : 'Select a Department folder'
                    }
                  />
                </div>
              )}
            </Spin>
          </main>
        </div>
      )}

      <Modal
        title="Create attachment folder"
        open={folderOpen}
        onCancel={() => setFolderOpen(false)}
        onOk={() => folderForm.submit()}
        confirmLoading={createFolder.isPending}
        destroyOnHidden
      >
        <Typography.Paragraph type="secondary">
          Location: {breadcrumbText(currentRig, selectedDepartment, selectedFolder, folders)}
        </Typography.Paragraph>
        <Form form={folderForm} layout="vertical" onFinish={(value) => createFolder.mutate(value)}>
          <Form.Item name="name" label="Folder name" rules={[{ required: true }]}>
            <Input maxLength={200} autoFocus />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={replaceAsset ? `Replace ${replaceAsset.name}` : 'Upload attachment'}
        open={uploadOpen}
        onCancel={() => {
          setUploadOpen(false);
          setReplaceAsset(undefined);
          setFile(undefined);
        }}
        onOk={() => assetForm.submit()}
        confirmLoading={saveFile.isPending}
        destroyOnHidden
      >
        {!replaceAsset ? (
          <Typography.Paragraph type="secondary">
            Location: {breadcrumbText(currentRig, selectedDepartment, selectedFolder, folders)}
          </Typography.Paragraph>
        ) : null}
        <Form form={assetForm} layout="vertical" onFinish={(value) => saveFile.mutate(value)}>
          {!replaceAsset ? (
            <>
              <Form.Item name="name" label="Attachment name">
                <Input placeholder="Defaults to file name" maxLength={500} />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <Input.TextArea maxLength={1000} />
              </Form.Item>
            </>
          ) : null}
          <Form.Item label="File" required>
            <Upload
              maxCount={1}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png"
              beforeUpload={(next) => {
                setFile(next);
                return false;
              }}
              onRemove={() => setFile(undefined)}
            >
              <Button icon={<UploadOutlined />}>Choose file</Button>
            </Upload>
          </Form.Item>
          <Typography.Text type="secondary">
            PDF, Office documents, JPG, and PNG; maximum 50 MB.
          </Typography.Text>
        </Form>
      </Modal>
    </section>
  );
}

function useScopeOptions(type: 'SITE' | 'RIG' | 'DEPARTMENT', siteId?: string, rigId?: string) {
  const suffix = `${siteId ? `&siteId=${siteId}` : ''}${rigId ? `&rigId=${rigId}` : ''}`;
  return useQuery({
    queryKey: ['scope-options', type, siteId, rigId],
    queryFn: () =>
      apiClient.get<OrganizationOption[]>(`/master-data/scope-options/list?type=${type}${suffix}`),
    enabled: type === 'SITE' || (type === 'RIG' ? Boolean(siteId) : Boolean(siteId && rigId)),
  });
}

function buildFolderTree(folders: AttachmentLibraryFolder[]): ExplorerTreeNode[] {
  const childrenByParent = new Map<string, AttachmentLibraryFolder[]>();
  folders.forEach((folder) => {
    const parent = folder.parentFolderId ?? 'root';
    childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), folder]);
  });
  const visit = (parentId: string, ancestors: Set<string>): ExplorerTreeNode[] =>
    (childrenByParent.get(parentId) ?? []).map((folder) => {
      if (ancestors.has(folder.id)) {
        return { key: folderKey(folder.id), title: folder.name, icon: <FolderOutlined /> };
      }
      const nextAncestors = new Set(ancestors).add(folder.id);
      return {
        key: folderKey(folder.id),
        title: folder.name,
        icon: <FolderOutlined />,
        children: visit(folder.id, nextAncestors),
      };
    });
  return visit('root', new Set());
}

function buildBreadcrumbs(
  rig: OrganizationOption | undefined,
  department: OrganizationOption | undefined,
  folder: AttachmentLibraryFolder | undefined,
  folders: AttachmentLibraryFolder[],
  select: (key: string) => void,
) {
  const items: Array<{ title: React.ReactNode }> = [
    {
      title: (
        <span className="attachment-breadcrumb-root">
          <FolderOpenOutlined /> {rig?.name ?? 'Rig'}
        </span>
      ),
    },
  ];
  if (!department) return items;
  items.push({
    title: (
      <button
        type="button"
        className="attachment-breadcrumb-button"
        onClick={() => select(departmentKey(department.id))}
      >
        {department.name}
      </button>
    ),
  });
  folderAncestors(folder, folders).forEach((item) =>
    items.push({
      title: (
        <button
          type="button"
          className="attachment-breadcrumb-button"
          onClick={() => select(folderKey(item.id))}
        >
          {item.name}
        </button>
      ),
    }),
  );
  return items;
}

function folderAncestors(
  folder: AttachmentLibraryFolder | undefined,
  folders: AttachmentLibraryFolder[],
) {
  const result: AttachmentLibraryFolder[] = [];
  const visited = new Set<string>();
  let current = folder;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.unshift(current);
    current = current.parentFolderId
      ? folders.find((candidate) => candidate.id === current?.parentFolderId)
      : undefined;
  }
  return result;
}

function breadcrumbText(
  rig: OrganizationOption | undefined,
  department: OrganizationOption | undefined,
  folder: AttachmentLibraryFolder | undefined,
  folders: AttachmentLibraryFolder[],
) {
  return [rig?.name, department?.name, ...folderAncestors(folder, folders).map((item) => item.name)]
    .filter(Boolean)
    .join(' / ');
}

function fileIcon(asset: AttachmentLibraryAsset) {
  const props = { className: 'attachment-item-icon', 'aria-hidden': true };
  if (asset.contentType === 'application/pdf') return <FilePdfOutlined {...props} />;
  if (asset.contentType.includes('word')) return <FileWordOutlined {...props} />;
  if (asset.contentType.includes('sheet') || asset.contentType.includes('excel'))
    return <FileExcelOutlined {...props} />;
  if (asset.contentType.includes('presentation') || asset.contentType.includes('powerpoint'))
    return <FilePptOutlined {...props} />;
  if (asset.contentType.startsWith('image/')) return <FileImageOutlined {...props} />;
  return <FileOutlined {...props} />;
}

const toOption = (item: OrganizationOption) => ({
  value: item.id,
  label: `${item.code} — ${item.name}`,
});
