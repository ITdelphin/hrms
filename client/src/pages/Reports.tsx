import { useState } from 'react';
import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import { useProperties, useTenants } from '@/api';
import { Button, Card, CardHeader, ErrorState } from '@/components/ui';
import { SelectField } from '@/components/ui/Fields';
import { api } from '@/lib/api';

const now = new Date();

export const Reports = () => {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [propertyId, setPropertyId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const properties = useProperties({ pageSize: 100 });
  const tenants = useTenants({ pageSize: 100 });

  const download = async (label: string, path: string, params?: Record<string, string | number | undefined>) => {
    setError(null);
    setBusy(label);
    try {
      await api.download(path, params);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const monthParams = { year, month, propertyId: propertyId || undefined };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
      {error && <ErrorState message={error} />}

      <Card>
        <CardHeader title="Rent Report" />
        <div className="space-y-4 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField label="Year" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i).map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </SelectField>
            <SelectField label="Month" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(Date.UTC(2000, m - 1, 1)).toLocaleDateString('en-US', { month: 'long' })}
                </option>
              ))}
            </SelectField>
            <SelectField label="Property (optional)" value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">All properties</option>
              {(properties.data?.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.unitNumber ? ` #${p.unitNumber}` : ''}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" loading={busy === 'xlsx'} onClick={() => download('xlsx', '/reports/monthly.xlsx', monthParams)}>
              <FileSpreadsheet className="h-4 w-4" /> Excel rent report
            </Button>
            <Button variant="secondary" loading={busy === 'docx'} onClick={() => download('docx', '/reports/monthly.docx', monthParams)}>
              <FileText className="h-4 w-4" /> Word rent report
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Tenant Register" />
        <div className="p-5">
          <Button variant="secondary" loading={busy === 'tenants'} onClick={() => download('tenants', '/reports/tenants.xlsx')}>
            <FileSpreadsheet className="h-4 w-4" /> Download all tenants (Excel)
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Tenant Rent Statement" />
        <div className="space-y-4 p-5">
          <div className="max-w-sm">
            <SelectField label="Tenant" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">Select tenant…</option>
              {(tenants.data?.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </SelectField>
          </div>
          <Button
            variant="secondary"
            disabled={!tenantId}
            loading={busy === 'statement'}
            onClick={() => download('statement', `/reports/tenants/${tenantId}/statement.docx`)}
          >
            <Download className="h-4 w-4" /> Download statement (Word)
          </Button>
        </div>
      </Card>
    </div>
  );
};
