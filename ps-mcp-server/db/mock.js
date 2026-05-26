'use strict';

/**
 * Mock data based on the PURCHASE_ORDER component — a well-known PeopleSoft
 * eProcurement component. All record/field names are authentic PS metadata.
 *
 * Every response includes "source": "mock" at the top level so consumers
 * can detect they are not receiving live data.
 */

const MOCK_DATA = {

  // ─── Tool 1: get_component_structure ────────────────────────────────────────
  // SQL1 — returns table names + OCCURSLEVEL for the component
  get_component_structure: {
    component: 'PURCHASE_ORDER',
    source:    'mock',
    scroll_levels: [
      { table_name: 'PO_HDR',           scroll_level: 0 },
      { table_name: 'PO_HDR_COMMENTS',  scroll_level: 0 },
      { table_name: 'PO_LINE',          scroll_level: 1 },
      { table_name: 'PO_LINE_COMMENTS', scroll_level: 1 },
      { table_name: 'PO_LINE_SHIP',     scroll_level: 2 },
      { table_name: 'PO_LINE_DISTRIB',  scroll_level: 3 },
    ],
  },

  // ─── Tool 2: get_all_records ─────────────────────────────────────────────────
  // SQL4 — returns all records with RECTYPE decoded
  get_all_records: {
    component: 'PURCHASE_ORDER',
    source:    'mock',
    records: [
      { record_name: 'PO_HDR',             record_type: 'Table'   },
      { record_name: 'PO_HDR_COMMENTS',    record_type: 'Table'   },
      { record_name: 'PO_LINE',            record_type: 'Table'   },
      { record_name: 'PO_LINE_COMMENTS',   record_type: 'Table'   },
      { record_name: 'PO_LINE_SHIP',       record_type: 'Table'   },
      { record_name: 'PO_LINE_DISTRIB',    record_type: 'Table'   },
      { record_name: 'PO_VENDOR_VW',       record_type: 'View'    },
      { record_name: 'VENDOR_LOC_VW',      record_type: 'View'    },
      { record_name: 'DERIVED_PO',         record_type: 'Derived' },
    ],
  },

  // ─── Tool 3: get_fields_by_record ────────────────────────────────────────────
  // SQL5 — returns fields for a given RECNAME (defaulting to PO_HDR)
  get_fields_by_record: {
    record: 'PO_HDR',
    source: 'mock',
    fields: [
      { field_num: 1,  field_name: 'BUSINESS_UNIT', field_label: 'Business Unit',     field_type: 0, length: 5,  is_key: true,  is_required: true,  is_search_key: true,  is_list_box: false },
      { field_num: 2,  field_name: 'PO_ID',          field_label: 'PO Number',         field_type: 0, length: 10, is_key: true,  is_required: true,  is_search_key: true,  is_list_box: false },
      { field_num: 3,  field_name: 'PO_DT',          field_label: 'PO Date',           field_type: 4, length: 10, is_key: false, is_required: true,  is_search_key: false, is_list_box: false },
      { field_num: 4,  field_name: 'VENDOR_ID',       field_label: 'Vendor ID',         field_type: 0, length: 10, is_key: false, is_required: true,  is_search_key: true,  is_list_box: false },
      { field_num: 5,  field_name: 'VENDOR_SETID',    field_label: 'Vendor SetID',      field_type: 0, length: 5,  is_key: false, is_required: true,  is_search_key: false, is_list_box: false },
      { field_num: 6,  field_name: 'VNDR_LOC',        field_label: 'Vendor Location',   field_type: 0, length: 10, is_key: false, is_required: false, is_search_key: false, is_list_box: false },
      { field_num: 7,  field_name: 'PO_STATUS',       field_label: 'PO Status',         field_type: 0, length: 1,  is_key: false, is_required: true,  is_search_key: true,  is_list_box: true  },
      { field_num: 8,  field_name: 'PO_REF',          field_label: 'PO Reference',      field_type: 0, length: 30, is_key: false, is_required: false, is_search_key: false, is_list_box: false },
      { field_num: 9,  field_name: 'CURRENCY_CD',     field_label: 'Currency Code',     field_type: 0, length: 3,  is_key: false, is_required: true,  is_search_key: false, is_list_box: false },
      { field_num: 10, field_name: 'PO_HDR_TOTAL',    field_label: 'PO Header Total',   field_type: 2, length: 27, is_key: false, is_required: false, is_search_key: false, is_list_box: false },
      { field_num: 11, field_name: 'APPROVAL_STATUS', field_label: 'Approval Status',   field_type: 0, length: 1,  is_key: false, is_required: false, is_search_key: true,  is_list_box: true  },
      { field_num: 12, field_name: 'COMMENTS',        field_label: 'Comments',           field_type: 1, length: 254,is_key: false, is_required: false, is_search_key: false, is_list_box: false },
    ],
  },

  // ─── Tool 4: get_peoplecode_by_event ─────────────────────────────────────────
  // SQL6 — returns PeopleCode programs attached to a record's fields by event
  get_peoplecode_by_event: {
    record:     'PO_HDR',
    source:     'mock',
    peoplecode: [
      {
        record_name: 'PO_HDR',
        field_name:  'PO_STATUS',
        event_name:  'FieldChange',
        code: `If PO_HDR.PO_STATUS = "A" Then
   PO_HDR.APPROVAL_STATUS = "P";
   DoSave();
Else
   PO_HDR.APPROVAL_STATUS = " ";
End-If;`,
      },
      {
        record_name: 'PO_HDR',
        field_name:  'VENDOR_ID',
        event_name:  'FieldEdit',
        code: `Local string &sVendorId = PO_HDR.VENDOR_ID;
If None(&sVendorId) Then
   Error MsgGet(11100, 1, "Vendor ID is required.");
End-If;
If Not ValidVendor(&sVendorId, PO_HDR.VENDOR_SETID) Then
   Error MsgGet(11100, 2, "Vendor %1 not found.", &sVendorId);
End-If;`,
      },
      {
        record_name: 'PO_HDR',
        field_name:  'PO_DT',
        event_name:  'FieldEdit',
        code: `If PO_HDR.PO_DT < %Date Then
   Warning MsgGet(11100, 5, "PO date is in the past.");
End-If;`,
      },
      {
        record_name: 'PO_HDR',
        field_name:  'CURRENCY_CD',
        event_name:  'FieldChange',
        code: `/* Recalculate all line amounts when currency changes */
Local number &i;
For &i = 1 To ActiveRowCount(PO_LINE.PO_LINE_NBR)
   FetchValue(PO_LINE.UNIT_PRICE, &i) * GetCurrencyRate(PO_HDR.CURRENCY_CD);
End-For;`,
      },
    ],
  },

  // ─── Tool 6: get_translate_values ────────────────────────────────────────────
  // SQL8 — returns active translate (XLAT) values for a field
  get_translate_values: {
    field:  'PO_STATUS',
    source: 'mock',
    values: [
      { field_value: 'A', long_name: 'Approved',    short_name: 'Appr' },
      { field_value: 'C', long_name: 'Complete',     short_name: 'Cmpl' },
      { field_value: 'D', long_name: 'Dispatched',   short_name: 'Disp' },
      { field_value: 'I', long_name: 'Initial',      short_name: 'Init' },
      { field_value: 'O', long_name: 'Open',          short_name: 'Open' },
      { field_value: 'P', long_name: 'Pending',       short_name: 'Pend' },
      { field_value: 'X', long_name: 'Canceled',      short_name: 'Canc' },
    ],
  },

  // ─── Tool 5: get_funclib_functions ───────────────────────────────────────────
  // SQL7 — returns functions stored in a FUNCLIB record
  get_funclib_functions: {
    funclib:   'FUNCLIB_PO',
    source:    'mock',
    functions: [
      {
        funclib_name: 'FUNCLIB_PO',
        field_name:   'FUNCLIB_PO',
        event_name:   'FieldFormula',
        code: `/* ── ValidVendor ───────────────────────────────────────────────────────── */
Function ValidVendor(&sVendorId As string, &sSetId As string) Returns boolean
   Local SQL &sql;
   Local Record &recVendor;
   &recVendor = CreateRecord(Record.VENDOR);
   &recVendor.SETID.Value = &sSetId;
   &recVendor.VENDOR_ID.Value = &sVendorId;
   If &recVendor.SelectByKey() Then
      Return True;
   End-If;
   Return False;
End-Function;

/* ── GetCurrencyRate ────────────────────────────────────────────────────── */
Function GetCurrencyRate(&sCurrencyCd As string) Returns number
   Local number &rate;
   SQLExec("SELECT RT_RATE FROM PS_RT_DFLT_VW WHERE CURRENCY_CD = :1", &sCurrencyCd, &rate);
   If None(&rate) Then
      Return 1;
   End-If;
   Return &rate;
End-Function;

/* ── CalculatePOTotal ───────────────────────────────────────────────────── */
Function CalculatePOTotal() Returns number
   Local number &total = 0;
   Local number &i;
   For &i = 1 To ActiveRowCount(PO_LINE.PO_LINE_NBR)
      &total = &total + FetchValue(PO_LINE.MERCHANDISE_AMT, &i);
   End-For;
   PO_HDR.TOTAL_AMT = &total;
   Return &total;
End-Function;`,
      },
    ],
  },
};

/**
 * Return the mock response for a given tool.
 *
 * Per the error contract in design.md, errors are returned as JSON — never thrown.
 *
 * @param {string} toolName - One of the five MCP tool names
 * @param {object} [params] - The tool's input params (echoed for context; not used to filter mock data)
 * @returns {object}
 */
function getMock(toolName, params = {}) {
  const data = MOCK_DATA[toolName];

  if (!data) {
    return {
      source: 'mock',
      error:  `No mock data registered for tool "${toolName}"`,
    };
  }

  // Support both named params {record_name} (direct HTTP test) and array binds ['PO_LINE'] (runQuery wrapper)
  const requestedRecord = Array.isArray(params) ? (params[0] || '') : (params.record_name || '');
  
  // Support translate values for different fields
  const requestedField = Array.isArray(params) ? (params[0] || '') : (params.field_name || '');

  if (toolName === 'get_translate_values' && requestedField === 'APPROVAL_STATUS') {
    return {
      field: 'APPROVAL_STATUS',
      source: 'mock',
      values: [
        { field_value: 'A', long_name: 'Approved',        short_name: 'Appr' },
        { field_value: 'D', long_name: 'Denied',          short_name: 'Deny' },
        { field_value: 'P', long_name: 'Pending Approval', short_name: 'Pend' },
      ],
    };
  }

  if (toolName === 'get_fields_by_record' && requestedRecord.includes('LINE')) {
    return {
      record: requestedRecord,
      source: 'mock',
      fields: [
        { field_num: 1, field_name: 'BUSINESS_UNIT', field_label: 'Business Unit',       field_type: 0, length: 5 },
        { field_num: 2, field_name: 'PO_ID',         field_label: 'PO Number',            field_type: 0, length: 10 },
        { field_num: 3, field_name: 'LINE_NBR',      field_label: 'Line Number',          field_type: 2, length: 5 },
        { field_num: 4, field_name: 'MERCHANDISE_AMT', field_label: 'Merchandise Amount', field_type: 3, length: 26 },
        { field_num: 5, field_name: 'UNIT_PRICE',    field_label: 'Unit Price',            field_type: 3, length: 26 },
        { field_num: 6, field_name: 'QTY_PO',        field_label: 'Quantity',              field_type: 2, length: 15 },
        { field_num: 7, field_name: 'PO_STATUS',     field_label: 'Line Status',           field_type: 0, length: 1 },
        { field_num: 8, field_name: 'CANCEL_STATUS', field_label: 'Cancel Status',         field_type: 0, length: 1 },
      ],
    };
  }

  // Return a shallow clone so callers cannot mutate the source object.
  return { ...data };
}

module.exports = { getMock };
