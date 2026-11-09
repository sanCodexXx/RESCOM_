import { normalizePhPhone } from './barangays.js';

export function registrationPayload(form) {
  return {
    family_id: form.family_id || undefined,
    family: {
      family_name: form.family_name.trim(),
      barangay: form.barangay,
      contact_number: normalizePhPhone(form.contact_number),
    },
    evacuee: {
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim(),
      last_name: form.last_name.trim(),
      age: parseInt(form.age, 10),
      gender: form.gender,
    },
    center_id: form.center_id,
    incident_id: form.incident_id,
    priority_types: form.priority_types,
  };
}
