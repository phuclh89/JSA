import { TranslationOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Alert, Button, Empty, List, Modal, Spin, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ApiClientError } from '../../services/api-client';
import { translationApi } from './translation-api';

export function PublishedTranslationsPopup({
  jsaId,
  jsaNumber,
  count,
  permitted,
}: {
  jsaId: string;
  jsaNumber: string;
  count: number;
  permitted: boolean;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const translations = useQuery({
    queryKey: ['published-translations-for-jsa', jsaId],
    queryFn: () => translationApi.publishedForJsa(jsaId),
    enabled: open && permitted && count > 0,
  });

  if (!count) return <Tag>None</Tag>;
  if (!permitted) return <Tag color="default">Permission required</Tag>;

  return (
    <>
      <Button
        type="link"
        size="small"
        icon={<TranslationOutlined />}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
      >
        {count} {count === 1 ? 'language' : 'languages'}
      </Button>
      <Modal
        open={open}
        title={`Published translations · ${jsaNumber}`}
        footer={<Button onClick={() => setOpen(false)}>Close</Button>}
        onCancel={() => setOpen(false)}
        destroyOnHidden
      >
        {translations.isLoading ? <Spin aria-label="Loading published translations" /> : null}
        {translations.error ? (
          <Alert type="error" showIcon message={(translations.error as ApiClientError).message} />
        ) : null}
        {!translations.isLoading && !translations.error ? (
          <List
            dataSource={translations.data ?? []}
            locale={{ emptyText: <Empty description="No published Translation" /> }}
            renderItem={(translation) => (
              <List.Item
                actions={[
                  <Button
                    key="view"
                    type="primary"
                    size="small"
                    onClick={() => navigate(`/jsa/translations/${translation.translationId}`)}
                  >
                    View
                  </Button>,
                ]}
              >
                <List.Item.Meta
                  avatar={<TranslationOutlined />}
                  title={`${translation.targetLanguageCode} — ${translation.targetLanguageName}`}
                  description={
                    <Typography.Text type="secondary">
                      {translation.sourceVersionLabel ??
                        `English Version ${translation.sourceVersionNumber}`}
                    </Typography.Text>
                  }
                />
              </List.Item>
            )}
          />
        ) : null}
      </Modal>
    </>
  );
}
