import {
  CopyOutlined,
  DownOutlined,
  FileAddOutlined,
  FileSearchOutlined,
  FilterOutlined,
  HeartFilled,
  HeartOutlined,
  HistoryOutlined,
  PrinterOutlined,
  RollbackOutlined,
  SyncOutlined,
  TranslationOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JsaBrowseItem, JsaBrowseKind, JsaSearchField } from '@jsams/shared-types';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiClientError } from '../../services/api-client';
import { browseApi, type BrowseParameters } from './browse-api';
import {
  JsaListFilters,
  JsaListRibbon,
  type JsaListSearchField,
  uniqueJsaListOptions,
} from './jsa-list-controls';
import { useRigContext } from './rig-context';
import { copyApi } from './copy-api';
import { JsaCopyModal } from './jsa-copy-modal';
import { TranslationAssignmentModal } from './translation-assignment-modal';
import { translationApi } from './translation-api';
import { PublishedTranslationsPopup } from './published-translations-popup';
import { jsaApi } from './jsa-api';
import { JsaCreateModal } from './jsa-create-page';
import { versioningApi } from './versioning-api';
import './published-jsa-page.css';

const labels: Record<JsaBrowseKind, string> = {
  published: 'Published JSA',
  favorites: 'My Favorites',
  all: 'All JSAs',
  drafts: 'My Drafts',
  approvals: 'Needs Approval',
  pending: 'Pending JSA',
  rejected: 'Rejected JSA',
};
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'short',
  timeStyle: 'short',
});

export function JsaBrowsePage({ kind }: { kind: JsaBrowseKind }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedRigId } = useRigContext();
  const [selectedJsaId, setSelectedJsaId] = useState<string>();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [translationModalOpen, setTranslationModalOpen] = useState(false);
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
  const [departmentId, setDepartmentId] = useState('all');
  const [siteId, setSiteId] = useState<string>();
  const [keyword, setKeyword] = useState('');
  const [effectiveKeyword, setEffectiveKeyword] = useState('');
  const [searchField, setSearchField] = useState<JsaListSearchField>('ALL');
  const [workingStatus, setWorkingStatus] = useState<string>();
  const [officialStatus, setOfficialStatus] = useState<string>();
  const [activeUpdate, setActiveUpdate] = useState<boolean>();
  const [favoriteFilter, setFavoriteFilter] = useState<boolean>();
  const [matrixVersionId, setMatrixVersionId] = useState<string>();
  const [riskResult, setRiskResult] = useState('');
  const [riskStage, setRiskStage] = useState<'INITIAL' | 'RESIDUAL' | 'EITHER'>('EITHER');
  const [creator, setCreator] = useState('');
  const [approver, setApprover] = useState('');
  const [createdRange, setCreatedRange] = useState<[string, string]>();
  const [publishedRange, setPublishedRange] = useState<[string, string]>();
  const [updatedRange, setUpdatedRange] = useState<[string, string]>();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState('updatedAt');
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    const timer = window.setTimeout(
      () => setEffectiveKeyword(keyword.trim().length >= 2 ? keyword.trim() : ''),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [keyword]);
  useEffect(() => {
    setPage(1);
    setSelectedJsaId(undefined);
  }, [
    kind,
    selectedRigId,
    departmentId,
    siteId,
    effectiveKeyword,
    searchField,
    workingStatus,
    officialStatus,
    activeUpdate,
    favoriteFilter,
    matrixVersionId,
    riskResult,
    riskStage,
    creator,
    approver,
    createdRange,
    publishedRange,
    updatedRange,
  ]);

  const parameters: BrowseParameters = {
    kind,
    ...(selectedRigId ? { rigId: selectedRigId } : {}),
    ...(departmentId !== 'all' ? { departmentId } : {}),
    ...(siteId ? { siteId } : {}),
    ...(effectiveKeyword ? { keyword: effectiveKeyword } : {}),
    searchField: searchField as JsaSearchField,
    ...(workingStatus ? { workingStatus } : {}),
    ...(officialStatus ? { officialStatus } : {}),
    ...(activeUpdate !== undefined ? { activeUpdate } : {}),
    ...(favoriteFilter !== undefined ? { favorite: favoriteFilter } : {}),
    ...(matrixVersionId ? { matrixVersionId } : {}),
    ...(riskResult.trim() ? { riskResult: riskResult.trim(), riskStage } : {}),
    ...(creator.trim() ? { creator: creator.trim() } : {}),
    ...(approver.trim() ? { approver: approver.trim() } : {}),
    ...(createdRange ? { createdFrom: createdRange[0], createdTo: createdRange[1] } : {}),
    ...(publishedRange ? { publishedFrom: publishedRange[0], publishedTo: publishedRange[1] } : {}),
    ...(updatedRange ? { updatedFrom: updatedRange[0], updatedTo: updatedRange[1] } : {}),
    page,
    pageSize,
    sort,
    direction,
  };
  const list = useQuery({
    queryKey: ['jsa-browse', parameters],
    queryFn: () => browseApi.list(parameters),
    placeholderData: (previous) => previous,
    refetchOnWindowFocus: false,
  });
  const capabilities = useQuery({
    queryKey: ['jsa-browse-capabilities'],
    queryFn: browseApi.capabilities,
  });
  const draftCapabilities = useQuery({
    queryKey: ['jsa-capabilities'],
    queryFn: jsaApi.capabilities,
    enabled: kind === 'published',
  });
  const copyCapabilities = useQuery({
    queryKey: ['jsa-copy-capabilities'],
    queryFn: copyApi.capabilities,
  });
  const translationCapabilities = useQuery({
    queryKey: ['translation-capabilities'],
    queryFn: translationApi.capabilities,
  });
  const versioningCapabilities = useQuery({
    queryKey: ['jsa-versioning-capabilities'],
    queryFn: versioningApi.capabilities,
    enabled: kind === 'published' || kind === 'favorites' || kind === 'all',
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const facets = useQuery({
    queryKey: ['jsa-browse-facets', selectedRigId ?? 'all'],
    queryFn: () => browseApi.facets(selectedRigId),
  });
  const selected = list.data?.items.find((item) => item.jsaId === selectedJsaId);
  const advancedFilterCount = [
    Boolean(siteId),
    Boolean(officialStatus),
    Boolean(matrixVersionId),
    Boolean(riskResult.trim()),
    Boolean(creator.trim()),
    Boolean(approver.trim()),
    favoriteFilter !== undefined,
    Boolean(createdRange),
    Boolean(publishedRange),
    Boolean(updatedRange),
    Boolean(workingStatus),
    activeUpdate !== undefined,
  ].filter(Boolean).length;
  const favorite = useMutation({
    mutationFn: (input: { jsaId: string; active: boolean }) =>
      input.active ? browseApi.favorite(input.jsaId) : browseApi.unfavorite(input.jsaId),
    onSuccess: (result) => {
      message.success(result.favorite ? 'JSA added to Favorites' : 'JSA removed from Favorites');
      void queryClient.invalidateQueries({ queryKey: ['jsa-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-browse-counts'] });
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const checkout = useMutation({
    mutationFn: (jsaId: string) => versioningApi.checkout(jsaId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['jsa-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
      message.success(
        result.matrixChanged
          ? 'Working Version created. Risk reassessment is required for the new Matrix.'
          : 'Working Version created from the Current Published Version.',
      );
      navigate(`/jsa/${result.jsaId}/draft`);
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const undoCheckout = useMutation({
    mutationFn: (jsaId: string) =>
      versioningApi.undo(jsaId, 'Discarded before workflow submission'),
    onSuccess: () => {
      setSelectedJsaId(undefined);
      void queryClient.invalidateQueries({ queryKey: ['jsa-browse'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-navigation-counts'] });
      void queryClient.invalidateQueries({ queryKey: ['jsa-drafts'] });
      message.success(
        'Checkout was undone. All unsubmitted changes were discarded and the JSA is available for checkout again.',
      );
    },
    onError: (error) => message.error((error as ApiClientError).message),
  });
  const departmentOptions = useMemo(
    () =>
      uniqueJsaListOptions(
        (facets.data?.departments ?? []).map((item) => ({
          value: item.id,
          label: `${item.code} — ${item.name}`,
        })),
      ),
    [facets.data?.departments],
  );
  const siteOptions = useMemo(
    () =>
      uniqueJsaListOptions(
        (facets.data?.sites ?? []).map((item) => ({
          value: item.id,
          label: `${item.code} — ${item.name}`,
        })),
      ),
    [facets.data?.sites],
  );
  const matrixOptions = useMemo(
    () =>
      uniqueJsaListOptions(
        (facets.data?.matrixVersions ?? []).map((item) => ({
          value: item.id,
          label: item.name,
        })),
      ),
    [facets.data?.matrixVersions],
  );
  const columns = useMemo<ColumnsType<JsaBrowseItem>>(
    () => [
      {
        title: 'JSA No.',
        dataIndex: 'jsaNumber',
        key: 'jsaNumber',
        width: 190,
        sorter: true,
      },
      {
        title: 'Job Title',
        dataIndex: 'jobTitle',
        key: 'jobTitle',
        width: 300,
        ellipsis: true,
        sorter: true,
        render: (value) => value || '—',
      },
      { title: 'Rig', dataIndex: 'rigName', width: 170, ellipsis: true },
      { title: 'Department', dataIndex: 'departmentName', width: 170, ellipsis: true },
      {
        title: 'Current',
        dataIndex: 'currentStatus',
        width: 120,
        render: (value) => (value ? <Tag color="green">{value}</Tag> : '—'),
      },
      {
        title: 'Working',
        dataIndex: 'workingStatus',
        width: 150,
        render: (value) => (value ? <Tag color="blue">{value}</Tag> : '—'),
      },
      {
        title: 'Translations',
        width: 170,
        render: (_, item) => (
          <PublishedTranslationsPopup
            jsaId={item.jsaId}
            jsaNumber={item.jsaNumber}
            count={item.publishedTranslationCount}
            permitted={Boolean(translationCapabilities.data?.view)}
          />
        ),
      },
      {
        title: 'Updated',
        dataIndex: 'updatedAt',
        key: 'updatedAt',
        width: 170,
        sorter: true,
        render: (value) => dateFormatter.format(new Date(value)),
      },
      {
        title: 'Matched in',
        width: 150,
        render: (_, item) =>
          item.matchedVersionKinds.length ? item.matchedVersionKinds.join(', ') : '—',
      },
    ],
    [translationCapabilities.data?.view],
  );

  const open = () => {
    if (!selected) return;
    navigate(
      kind === 'approvals'
        ? `/jsa/${selected.jsaId}/workflow`
        : `/jsa/${selected.jsaId}/draft${selected.currentStatus ? '?source=current' : ''}`,
    );
  };
  const tableChange = (pagination: TablePaginationConfig, _filters: unknown, sorterValue: any) => {
    setPage(pagination.current ?? 1);
    setPageSize(pagination.pageSize ?? 25);
    const activeSorter = Array.isArray(sorterValue) ? sorterValue[0] : sorterValue;
    if (activeSorter?.field || activeSorter?.columnKey) {
      setSort(String(activeSorter.field ?? activeSorter.columnKey));
      setDirection(activeSorter.order === 'ascend' ? 'asc' : 'desc');
    }
  };

  return (
    <main className="published-jsa-page">
      <Typography.Title level={1} className="published-jsa-sr-title">
        {labels[kind]}
      </Typography.Title>
      <JsaListRibbon
        ariaLabel={`${labels[kind]} operations`}
        actions={[
          ...(kind === 'published'
            ? [
                {
                  key: 'create',
                  icon: <FileAddOutlined />,
                  label: 'Create JSA',
                  disabled: !draftCapabilities.data?.create,
                  disabledReason: !draftCapabilities.data?.create
                    ? 'Create JSA permission is required'
                    : undefined,
                  onClick: () => setCreateModalOpen(true),
                },
              ]
            : []),
          ...(kind === 'published' || kind === 'favorites' || kind === 'all'
            ? [
                {
                  key: 'checkout',
                  icon: <SyncOutlined />,
                  label: selected?.workingStatus
                    ? 'Edit Working'
                    : checkout.isPending
                      ? 'Checking out'
                      : 'Checkout JSA',
                  disabled:
                    !selected ||
                    selected.currentStatus !== 'PUBLISHED' ||
                    (!selected.workingStatus && !versioningCapabilities.data?.update) ||
                    checkout.isPending,
                  disabledReason: !selected
                    ? 'Select one Current Published JSA'
                    : selected.currentStatus !== 'PUBLISHED'
                      ? 'Checkout requires a Current Published Version'
                      : !selected.workingStatus && !versioningCapabilities.data?.configured
                        ? 'JSA revision permission mappings are not configured'
                        : !selected.workingStatus && !versioningCapabilities.data?.update
                          ? 'Update JSA permission is required'
                          : checkout.isPending
                            ? 'Checkout is in progress'
                            : undefined,
                  onClick: () => {
                    if (!selected) return;
                    if (selected.workingStatus) {
                      navigate(`/jsa/${selected.jsaId}/draft`);
                      return;
                    }
                    Modal.confirm({
                      title: 'Checkout JSA for editing?',
                      content:
                        'A new Working Version will be created from the exact Current Published Version. The Current Published Version remains operational until this update is approved.',
                      okText: 'Checkout and Edit',
                      onOk: () => checkout.mutateAsync(selected.jsaId),
                    });
                  },
                },
                {
                  key: 'undo-checkout',
                  icon: <RollbackOutlined />,
                  label: undoCheckout.isPending ? 'Undoing Checkout' : 'Undo Checkout',
                  disabled:
                    !selected ||
                    selected.workingStatus !== 'DRAFT' ||
                    !versioningCapabilities.data?.undoCheckout ||
                    undoCheckout.isPending,
                  disabledReason: !selected
                    ? 'Select one checked-out JSA'
                    : selected.workingStatus !== 'DRAFT'
                      ? 'Undo Checkout is available only before submission'
                      : !versioningCapabilities.data?.undoCheckout
                        ? 'Undo Checkout permission is required'
                        : undefined,
                  onClick: () => {
                    if (!selected) return;
                    Modal.confirm({
                      title: 'Discard this checkout and all changes?',
                      content:
                        'The unsubmitted Working Version will be cancelled. The Current Published Version remains unchanged, and other authorized users will be able to checkout this JSA.',
                      okText: 'Undo Checkout',
                      okButtonProps: { danger: true },
                      cancelText: 'Keep Editing',
                      onOk: () => undoCheckout.mutateAsync(selected.jsaId),
                    });
                  },
                },
              ]
            : []),
          {
            key: 'view',
            icon: <FileSearchOutlined />,
            label: kind === 'approvals' ? 'Review JSA' : 'View JSA',
            disabled: !selected,
            onClick: open,
          },
          {
            key: 'history',
            icon: <HistoryOutlined />,
            label: 'Approval history',
            disabled: !selected,
            onClick: () => selected && navigate(`/jsa/${selected.jsaId}/workflow`),
          },
          {
            key: 'print',
            icon: <PrinterOutlined />,
            label: 'Print JSA',
            disabled: !selected?.currentStatus,
            onClick: () =>
              selected &&
              window.open(`/jsa/${selected.jsaId}/print`, '_blank', 'noopener,noreferrer'),
          },
          ...(kind === 'published' || kind === 'favorites' || kind === 'all'
            ? [
                {
                  key: 'translate',
                  icon: <TranslationOutlined />,
                  label: 'Assign Translation',
                  disabled:
                    selected?.currentStatus !== 'PUBLISHED' ||
                    !translationCapabilities.data?.assign,
                  disabledReason: !translationCapabilities.data?.configured
                    ? 'Translation permission mappings are not configured'
                    : !translationCapabilities.data?.assign
                      ? 'Translation Assign permission is required'
                      : selected?.currentStatus !== 'PUBLISHED'
                        ? 'Select one Current Published JSA'
                        : undefined,
                  onClick: () => selected && setTranslationModalOpen(true),
                },
                {
                  key: 'copy',
                  icon: <CopyOutlined />,
                  label: 'Copy JSA',
                  disabled:
                    selected?.currentStatus !== 'PUBLISHED' ||
                    !copyCapabilities.data?.copy ||
                    !copyCapabilities.data?.create ||
                    !copyCapabilities.data?.view,
                  disabledReason: !selected
                    ? 'Select one Current Published JSA'
                    : selected.currentStatus !== 'PUBLISHED'
                      ? 'The selected row has no eligible Current Published Version'
                      : !copyCapabilities.data?.configured
                        ? 'Copy permission mapping is not configured'
                        : !copyCapabilities.data.copy
                          ? 'Copy permission is required'
                          : !copyCapabilities.data.create
                            ? 'Destination Create permission is required'
                            : !copyCapabilities.data.view
                              ? 'Source View permission is required'
                              : undefined,
                  onClick: () => selected && setCopyModalOpen(true),
                },
                {
                  key: 'favorite',
                  icon: selected?.favorite ? <HeartFilled /> : <HeartOutlined />,
                  label: selected?.favorite ? 'Unfavorite' : 'Favorite',
                  disabled:
                    !selected?.currentStatus || !capabilities.data?.favorite || favorite.isPending,
                  disabledReason: !selected
                    ? 'Select one Current Published JSA'
                    : !selected.currentStatus
                      ? 'The selected row has no Current Published Version'
                      : !capabilities.data?.favoriteConfigured
                        ? 'Favorite permission mapping is not configured'
                        : !capabilities.data.favorite
                          ? 'Favorite permission is required'
                          : favorite.isPending
                            ? 'Favorite update is in progress'
                            : undefined,
                  onClick: () =>
                    selected &&
                    favorite.mutate({ jsaId: selected.jsaId, active: !selected.favorite }),
                },
              ]
            : []),
        ]}
      />
      <section className="published-list" aria-label={`${labels[kind]} list`}>
        <JsaListFilters
          department={departmentId}
          departmentOptions={departmentOptions}
          keyword={keyword}
          searchField={searchField}
          onDepartmentChange={setDepartmentId}
          onKeywordChange={setKeyword}
          onSearchFieldChange={setSearchField}
        />
        <div className="jsa-advanced-search-toggle">
          <Button
            type="text"
            icon={advancedSearchOpen ? <UpOutlined /> : <FilterOutlined />}
            aria-expanded={advancedSearchOpen}
            aria-controls="jsa-advanced-search"
            onClick={() => setAdvancedSearchOpen((current) => !current)}
          >
            {advancedSearchOpen ? 'Hide Advanced Search' : 'Advanced Search'}
            {advancedFilterCount > 0 ? ` (${advancedFilterCount})` : ''}
            {!advancedSearchOpen ? <DownOutlined aria-hidden="true" /> : null}
          </Button>
        </div>
        {advancedSearchOpen ? (
          <div
            id="jsa-advanced-search"
            className="jsa-structured-filters"
            aria-label="Advanced JSA search filters"
          >
            <label>
              <span>Owner Site</span>
              <Select
                allowClear
                value={siteId}
                onChange={setSiteId}
                placeholder="Any governed Site"
                options={siteOptions}
              />
            </label>
            <label>
              <span>Official number</span>
              <Select
                allowClear
                value={officialStatus}
                onChange={setOfficialStatus}
                placeholder="Any"
                options={[
                  { value: 'OFFICIAL', label: 'Official' },
                  { value: 'TEMPORARY', label: 'Temporary' },
                ]}
              />
            </label>
            <label>
              <span>Matrix Version</span>
              <Select
                allowClear
                showSearch
                value={matrixVersionId}
                onChange={setMatrixVersionId}
                placeholder="Any"
                options={matrixOptions}
              />
            </label>
            <label>
              <span>Risk result</span>
              <Input
                allowClear
                value={riskResult}
                onChange={(event) => setRiskResult(event.target.value)}
                placeholder="Code or exact name"
              />
            </label>
            <label>
              <span>Risk stage</span>
              <Select
                value={riskStage}
                onChange={setRiskStage}
                disabled={!riskResult.trim()}
                options={[
                  { value: 'EITHER', label: 'Initial or Residual' },
                  { value: 'INITIAL', label: 'Initial' },
                  { value: 'RESIDUAL', label: 'Residual' },
                ]}
              />
            </label>
            <label>
              <span>Creator</span>
              <Input
                allowClear
                value={creator}
                onChange={(event) => setCreator(event.target.value)}
                placeholder="Username or display name"
              />
            </label>
            <label>
              <span>Publisher / approver</span>
              <Input
                allowClear
                value={approver}
                onChange={(event) => setApprover(event.target.value)}
                placeholder="Username or display name"
              />
            </label>
            <label>
              <span>Favorite state</span>
              <Select
                allowClear
                value={favoriteFilter}
                onChange={setFavoriteFilter}
                disabled={!capabilities.data?.favorite}
                placeholder={capabilities.data?.favorite ? 'Any' : 'Permission required'}
                options={[
                  { value: true, label: 'Favorite' },
                  { value: false, label: 'Not favorite' },
                ]}
              />
            </label>
            <label>
              <span>Created range</span>
              <DatePicker.RangePicker
                onChange={(_, values) =>
                  setCreatedRange(values[0] && values[1] ? [values[0], values[1]] : undefined)
                }
              />
            </label>
            <label>
              <span>Published range</span>
              <DatePicker.RangePicker
                onChange={(_, values) =>
                  setPublishedRange(values[0] && values[1] ? [values[0], values[1]] : undefined)
                }
              />
            </label>
            <label>
              <span>Updated range</span>
              <DatePicker.RangePicker
                onChange={(_, values) =>
                  setUpdatedRange(values[0] && values[1] ? [values[0], values[1]] : undefined)
                }
              />
            </label>
            <label>
              <span>Working status</span>
              <Select
                allowClear
                value={workingStatus}
                onChange={setWorkingStatus}
                placeholder="Any"
                options={[
                  'DRAFT',
                  'DEPARTMENT_HEAD_REVIEW',
                  'STC_REVIEW',
                  'OIM_REVIEW',
                  'RIG_MANAGER_REVIEW',
                  'RETURNED',
                  'REJECTED',
                ].map((value) => ({ value, label: value.replaceAll('_', ' ') }))}
              />
            </label>
            <label>
              <span>Active update</span>
              <Select
                allowClear
                value={activeUpdate}
                onChange={setActiveUpdate}
                placeholder="Any"
                options={[
                  { value: true, label: 'Has Working Version' },
                  { value: false, label: 'No Working Version' },
                ]}
              />
            </label>
          </div>
        ) : null}
        {keyword.trim().length === 1 ? (
          <Alert type="info" showIcon message="Enter at least 2 characters to search content" />
        ) : null}
        {list.isLoading ? (
          <div className="published-list-feedback">
            <Spin aria-label={`Loading ${labels[kind]}`} />
          </div>
        ) : list.error ? (
          <Alert
            type="error"
            showIcon
            message={`${labels[kind]} could not be loaded`}
            description={(list.error as ApiClientError).message}
            action={<Button onClick={() => void list.refetch()}>Retry</Button>}
          />
        ) : (
          <div className="published-table-scroll">
            <Table<JsaBrowseItem>
              className="published-table"
              rowKey="jsaId"
              size="small"
              tableLayout="fixed"
              dataSource={list.data?.items ?? []}
              columns={columns}
              loading={list.isFetching}
              pagination={{
                current: page,
                pageSize,
                total: list.data?.total ?? 0,
                showSizeChanger: true,
                pageSizeOptions: [10, 25, 50, 100],
              }}
              onChange={tableChange}
              rowSelection={{
                type: 'radio',
                selectedRowKeys: selected ? [selected.jsaId] : [],
                onChange: (keys) => setSelectedJsaId(String(keys[0])),
                columnWidth: 42,
              }}
              onRow={(item) => ({
                onClick: () => setSelectedJsaId(item.jsaId),
                onDoubleClick: () =>
                  navigate(
                    kind === 'approvals'
                      ? `/jsa/${item.jsaId}/workflow`
                      : `/jsa/${item.jsaId}/draft${item.currentStatus ? '?source=current' : ''}`,
                  ),
              })}
              locale={{
                emptyText: (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={`No ${labels[kind]} matches the current filters`}
                  />
                ),
              }}
            />
          </div>
        )}
      </section>
      <JsaCopyModal
        open={copyModalOpen}
        source={selected}
        onClose={() => setCopyModalOpen(false)}
      />
      <TranslationAssignmentModal
        open={translationModalOpen}
        jsaId={selected?.jsaId}
        onClose={() => setTranslationModalOpen(false)}
      />
      <JsaCreateModal open={createModalOpen} onClose={() => setCreateModalOpen(false)} />
    </main>
  );
}
