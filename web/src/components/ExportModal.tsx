import React, { useState } from 'react';
import { Modal, Select, DatePicker, Button, message } from 'antd';
import apiGet from '../services/api';
import dayjs from 'dayjs';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  bookId: string;
}

export default function ExportModal({ open, onClose, bookId }: ExportModalProps) {
  const [loading, setLoading] = useState(false);
  const [accountId, setAccountId] = useState<string | undefined>(undefined);
  const [startDate, setStartDate] = useState<string>(dayjs().subtract(1, 'month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string>(dayjs().format('YYYY-MM-DD'));

  const handleExport = async () => {
    if (!bookId) {
      message.error('无法获取账本信息');
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({
        book_id: bookId,
        start_date: startDate,
        end_date: endDate,
      });
      if (accountId) params.append('account_id', accountId);
      window.open(`/api/v1/exports/transactions?${params.toString()}`, '_blank');
      onClose();
    } catch {
      message.error('导出失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="导出交易数据"
      open={open}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>取消</Button>,
        <Button key="export" type="primary" loading={loading} onClick={handleExport}>导出 CSV</Button>,
      ]}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>账户（可选）</label>
          <Select
            style={{ width: '100%' }}
            placeholder="全部账户"
            allowClear
            value={accountId}
            onChange={setAccountId}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>开始日期</label>
            <DatePicker
              style={{ width: '100%' }}
              value={startDate ? dayjs(startDate) : null}
              onChange={(d) => setStartDate(d ? d.format('YYYY-MM-DD') : '')}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>结束日期</label>
            <DatePicker
              style={{ width: '100%' }}
              value={endDate ? dayjs(endDate) : null}
              onChange={(d) => setEndDate(d ? d.format('YYYY-MM-DD') : '')}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}