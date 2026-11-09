export const FIELD_VIEWS = ['/evacuees', '/evacuees/stats', '/centers', '/incidents', '/priority-cases', '/dromic'];

const saves = [
  ['POST', /^\/evacuees\/register$/, 'registration', 'Evacuee registration'],
  ['PUT', /^\/evacuees\/[^/]+$/, 'evacuee', 'Evacuee details'],
  ['PATCH', /^\/evacuees\/[^/]+\/checkout$/, 'checkout', 'Evacuee checkout'],
  ['POST', /^\/centers$/, 'newCenter', 'New evacuation center'],
  ['PUT', /^\/centers\/[^/]+$/, 'center', 'Evacuation center update'],
  ['POST', /^\/incidents$/, 'newIncident', 'New disaster incident'],
  ['PATCH', /^\/incidents\/[^/]+\/status$/, 'incident', 'Incident status'],
  ['POST', /^\/priority-cases$/, 'newPriority', 'New priority case'],
  ['PATCH', /^\/priority-cases\/[^/]+\/status$/, 'priority', 'Priority case status'],
  ['POST', /^\/dromic$/, 'newReport', 'New DROMIC report'],
  ['PATCH', /^\/dromic\/[^/]+\/status$/, 'report', 'DROMIC report status']
];

export function fieldSave(method, path) {
  const match = saves.find(([verb, pattern]) => verb === method && pattern.test(path));
  return match ? { kind: match[2], label: match[3] } : null;
}

export function fieldView(path) {
  return FIELD_VIEWS.includes(path) || /^\/analytics\/overview\?|^\/dromic\/\d+\/summary$/.test(path);
}

export const localId = (change, key) => `local:${change.id}:${key}`;
export const isLocalId = value => typeof value === 'string' && value.startsWith('local:');
const matches = (first, second) => String(first) === String(second);

export function resolveChange(change, aliases) {
  const resolve = value => isLocalId(value) ? aliases[value] ?? value : value;
  return {
    ...change,
    path: change.path.split('/').map(resolve).join('/'),
    body: Object.fromEntries(Object.entries(change.body).map(([key, value]) => [
      key, key.endsWith('_id') ? resolve(value) : value
    ]))
  };
}

export function hasLocalReferences(change) {
  return change.path.split('/').some(isLocalId) ||
    Object.entries(change.body).some(([key, value]) => key.endsWith('_id') && isLocalId(value));
}

export function confirmedIds(change, result) {
  const created = {
    newCenter: { center_id: result.center_id },
    newIncident: { incident_id: result.incident_id },
    newPriority: { priority_id: result.priority_id },
    newReport: { report_id: result.report_id },
    registration: { evacuee_id: result.evacuee_id, family_id: result.family_id, record_id: result.record?.record_id }
  }[change.kind] || {};
  if (change.kind === 'registration') {
    for (const [index, id] of (result.priority_ids || []).entries()) created[`priority-${index}`] = id;
  }
  return Object.fromEntries(Object.entries(created).filter(([, id]) => id != null).map(([key, id]) => [localId(change, key), id]));
}

function applyChange(views, change, user, result) {
  const { body, kind } = change;
  const target = change.path.split('/')[2];
  const time = change.createdAt;
  const marker = result ? {} : { pending_sync: true };
  const list = path => views[path] || [];
  const find = (path, field, id) => list(path).find(row => matches(row[field], id));
  const add = (path, field, row) => {
    views[path] = [{ ...row, ...marker }, ...list(path).filter(existing => !matches(existing[field], row[field]))];
  };
  const edit = (path, field, id, changes) => {
    views[path] = list(path).map(row => matches(row[field], id) ? { ...row, ...changes, ...marker } : row);
  };

  switch (kind) {
    case 'newCenter':
      add('/centers', 'center_id', {
        ...body, capacity: Number(body.capacity) || 0, occupancy: 0, status: body.status || 'Open',
        center_id: localId(change, 'center_id'), ...result
      });
      break;
    case 'center':
      edit('/centers', 'center_id', target, result || {
        ...body, ...(body.capacity !== undefined ? { capacity: Number(body.capacity) } : {})
      });
      break;
    case 'newIncident':
      add('/incidents', 'incident_id', {
        ...body, incident_id: localId(change, 'incident_id'), reporting_status: 'Pending',
        date_started: time, reporter_first: user.first_name, reporter_last: user.last_name, ...result
      });
      break;
    case 'incident':
      edit('/incidents', 'incident_id', target, result || {
        reporting_status: body.reporting_status, date_ended: body.reporting_status === 'Resolved' ? time : null
      });
      break;
    case 'registration': {
      const center = find('/centers', 'center_id', body.center_id);
      const household = body.family_id ? find('/evacuees', 'family_id', body.family_id) : body.family;
      const row = {
        ...body.evacuee, evacuee_id: result?.evacuee_id ?? localId(change, 'evacuee_id'),
        record_id: result?.record?.record_id ?? localId(change, 'record_id'),
        family_id: result?.family_id ?? (body.family_id || localId(change, 'family_id')),
        family_name: household?.family_name, barangay: household?.barangay, contact_number: household?.contact_number,
        center_id: body.center_id, center_name: result?.center_name ?? center?.center_name,
        date_evacuated: result?.record?.date_evacuated ?? time,
        record_status: 'Present', priority_types: body.priority_types || []
      };
      const alreadyListed = find('/evacuees', 'evacuee_id', row.evacuee_id);
      add('/evacuees', 'evacuee_id', row);
      if (center && !alreadyListed) {
        const occupancy = center.occupancy + 1;
        edit('/centers', 'center_id', center.center_id, {
          occupancy, status: occupancy >= center.capacity ? 'Full' : center.status
        });
      }
      for (const [index, case_type] of row.priority_types.entries()) {
        add('/priority-cases', 'priority_id', {
          priority_id: result?.priority_ids?.[index] ?? localId(change, `priority-${index}`),
          evacuee_id: row.evacuee_id, first_name: row.first_name, last_name: row.last_name,
          family_name: row.family_name, barangay: row.barangay, case_type,
          priority_status: 'Flagged', created_at: time
        });
      }
      break;
    }
    case 'evacuee': {
      edit('/evacuees', 'evacuee_id', target, result || body);
      const { first_name, last_name } = find('/evacuees', 'evacuee_id', target) || {};
      views['/priority-cases'] = list('/priority-cases').map(row => matches(row.evacuee_id, target)
        ? { ...row, first_name, last_name, ...marker } : row);
      break;
    }
    case 'checkout': {
      const row = find('/evacuees', 'evacuee_id', target);
      if (!row) break;
      if (row.record_status === 'Present') {
        const center = find('/centers', 'center_id', row.center_id);
        if (center) edit('/centers', 'center_id', row.center_id, result?.center || {
          occupancy: Math.max(0, center.occupancy - 1), status: center.status === 'Full' ? 'Open' : center.status
        });
      }
      edit('/evacuees', 'evacuee_id', target, { record_status: 'Checked out' });
      break;
    }
    case 'newPriority': {
      const row = find('/evacuees', 'evacuee_id', body.evacuee_id);
      add('/priority-cases', 'priority_id', {
        ...body, priority_id: localId(change, 'priority_id'), priority_status: 'Flagged', created_at: time,
        first_name: row?.first_name, last_name: row?.last_name, family_name: row?.family_name, barangay: row?.barangay, ...result
      });
      break;
    }
    case 'priority':
      edit('/priority-cases', 'priority_id', target, result || body);
      break;
    case 'newReport': {
      const incident = find('/incidents', 'incident_id', body.incident_id);
      add('/dromic', 'report_id', {
        ...body, report_id: localId(change, 'report_id'), report_no: null,
        report_date: time, as_of: time, reporting_status: 'Draft',
        disaster_name: incident?.disaster_name, disaster_type: incident?.disaster_type,
        brgy: incident?.brgy, author_first: user.first_name, author_last: user.last_name, ...result
      });
      break;
    }
    case 'report':
      edit('/dromic', 'report_id', target, result || body);
      break;
  }

  if (['registration', 'checkout', 'newPriority', 'priority'].includes(kind)) {
    const priorityRows = list('/priority-cases').filter(row => row.priority_status === 'Flagged');
    const priorityTypes = new Map();
    for (const row of priorityRows) {
      const types = priorityTypes.get(String(row.evacuee_id)) || [];
      types.push(row.case_type);
      priorityTypes.set(String(row.evacuee_id), types);
    }
    views['/evacuees'] = list('/evacuees').map(row => ({
      ...row, priority_types: priorityTypes.get(String(row.evacuee_id)) || []
    }));
    views['/evacuees/stats'] = {
      totalEvacuees: list('/evacuees').length,
      totalPriorityCases: priorityTypes.size,
      currentlyPresent: list('/evacuees').filter(row => row.record_status === 'Present').length
    };
  }
}

export function projectedViews(workspace) {
  const views = { ...workspace.views };
  for (const change of workspace.queue) {
    if (!change.review && !change.legacy) applyChange(views, resolveChange(change, workspace.aliases), workspace.user);
  }
  return views;
}

export function acceptFieldWrite(workspace, change, result) {
  const views = { ...workspace.views };
  applyChange(views, resolveChange(change, workspace.aliases), workspace.user, result);
  return {
    ...workspace, views,
    aliases: { ...workspace.aliases, ...confirmedIds(change, result) },
    queue: workspace.queue.filter(item => item.id !== change.id)
  };
}
