CREATE TRIGGER household_insert_integrity BEFORE INSERT ON records WHEN NEW.kind='households' BEGIN
 SELECT RAISE(ABORT,'RESCOM_REFERENCE') WHERE NOT EXISTS(SELECT 1 FROM records WHERE id=json_extract(NEW.data,'$.centerId') AND space=NEW.space AND kind='centers') OR NOT EXISTS(SELECT 1 FROM records WHERE id=json_extract(NEW.data,'$.eventId') AND space=NEW.space AND kind='events');
 SELECT RAISE(ABORT,'RESCOM_CAPACITY') WHERE json_extract(NEW.data,'$.status')='In center' AND (NOT EXISTS(SELECT 1 FROM records WHERE id=json_extract(NEW.data,'$.centerId') AND space=NEW.space AND kind='centers' AND json_extract(data,'$.status')='Open') OR (SELECT COALESCE(SUM(json_array_length(json_extract(data,'$.members'))),0) FROM records WHERE space=NEW.space AND kind='households' AND id<>NEW.id AND json_extract(data,'$.centerId')=json_extract(NEW.data,'$.centerId') AND json_extract(data,'$.status')='In center')+json_array_length(json_extract(NEW.data,'$.members'))>(SELECT json_extract(data,'$.capacity') FROM records WHERE id=json_extract(NEW.data,'$.centerId') AND space=NEW.space AND kind='centers'));
END;
--> statement-breakpoint
CREATE TRIGGER household_update_integrity BEFORE UPDATE ON records WHEN NEW.kind='households' BEGIN
 SELECT RAISE(ABORT,'RESCOM_REFERENCE') WHERE NOT EXISTS(SELECT 1 FROM records WHERE id=json_extract(NEW.data,'$.centerId') AND space=NEW.space AND kind='centers') OR NOT EXISTS(SELECT 1 FROM records WHERE id=json_extract(NEW.data,'$.eventId') AND space=NEW.space AND kind='events');
 SELECT RAISE(ABORT,'RESCOM_CAPACITY') WHERE json_extract(NEW.data,'$.status')='In center' AND (NOT EXISTS(SELECT 1 FROM records WHERE id=json_extract(NEW.data,'$.centerId') AND space=NEW.space AND kind='centers' AND json_extract(data,'$.status')='Open') OR (SELECT COALESCE(SUM(json_array_length(json_extract(data,'$.members'))),0) FROM records WHERE space=NEW.space AND kind='households' AND id<>NEW.id AND json_extract(data,'$.centerId')=json_extract(NEW.data,'$.centerId') AND json_extract(data,'$.status')='In center')+json_array_length(json_extract(NEW.data,'$.members'))>(SELECT json_extract(data,'$.capacity') FROM records WHERE id=json_extract(NEW.data,'$.centerId') AND space=NEW.space AND kind='centers'));
END;
--> statement-breakpoint
CREATE TRIGGER center_update_integrity BEFORE UPDATE ON records WHEN NEW.kind='centers' BEGIN
 SELECT RAISE(ABORT,'RESCOM_CAPACITY') WHERE (SELECT COALESCE(SUM(json_array_length(json_extract(data,'$.members'))),0) FROM records WHERE space=NEW.space AND kind='households' AND json_extract(data,'$.centerId')=NEW.id AND json_extract(data,'$.status')='In center')>json_extract(NEW.data,'$.capacity');
 SELECT RAISE(ABORT,'RESCOM_OCCUPIED') WHERE json_extract(NEW.data,'$.status')<>'Open' AND EXISTS(SELECT 1 FROM records WHERE space=NEW.space AND kind='households' AND json_extract(data,'$.centerId')=NEW.id AND json_extract(data,'$.status')='In center');
END;
--> statement-breakpoint
CREATE TRIGGER center_delete_integrity BEFORE DELETE ON records WHEN OLD.kind='centers' BEGIN
 SELECT RAISE(ABORT,'RESCOM_REFERENCE') WHERE EXISTS(SELECT 1 FROM records WHERE space=OLD.space AND kind='households' AND json_extract(data,'$.centerId')=OLD.id) OR EXISTS(SELECT 1 FROM accounts WHERE space=OLD.space AND center_id=OLD.id);
END;
--> statement-breakpoint
CREATE TRIGGER event_delete_integrity BEFORE DELETE ON records WHEN OLD.kind='events' BEGIN
 SELECT RAISE(ABORT,'RESCOM_REFERENCE') WHERE EXISTS(SELECT 1 FROM records WHERE space=OLD.space AND kind IN ('households','reports') AND json_extract(data,'$.eventId')=OLD.id);
END;
--> statement-breakpoint
CREATE TRIGGER account_insert_integrity BEFORE INSERT ON accounts WHEN NEW.center_id<>'' BEGIN
 SELECT RAISE(ABORT,'RESCOM_REFERENCE') WHERE NOT EXISTS(SELECT 1 FROM records WHERE id=NEW.center_id AND space=NEW.space AND kind='centers');
END;
--> statement-breakpoint
CREATE TRIGGER account_update_integrity BEFORE UPDATE ON accounts WHEN NEW.center_id<>'' BEGIN
 SELECT RAISE(ABORT,'RESCOM_REFERENCE') WHERE NOT EXISTS(SELECT 1 FROM records WHERE id=NEW.center_id AND space=NEW.space AND kind='centers');
END;
