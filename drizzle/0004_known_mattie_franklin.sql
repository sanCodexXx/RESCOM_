CREATE TABLE `report_sequences` (
	`space` text NOT NULL,
	`event_id` text NOT NULL,
	`last_number` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `report_sequences_space_event` ON `report_sequences` (`space`,`event_id`);
--> statement-breakpoint
CREATE TRIGGER report_insert_final_lock BEFORE INSERT ON records
WHEN NEW.kind='reports' AND json_extract(NEW.data,'$.eventId')<>'all'
BEGIN
  SELECT RAISE(ABORT,'RESCOM_FINAL_REPORT') WHERE EXISTS (
    SELECT 1 FROM records WHERE space=NEW.space AND kind='reports'
    AND json_extract(data,'$.eventId')=json_extract(NEW.data,'$.eventId')
    AND json_extract(data,'$.status')='Final'
  );
END;
--> statement-breakpoint
CREATE TRIGGER report_update_final_lock BEFORE UPDATE ON records
WHEN NEW.kind='reports'
BEGIN
  SELECT RAISE(ABORT,'RESCOM_FINAL_REPORT') WHERE json_extract(OLD.data,'$.status')='Final' OR (
    json_extract(NEW.data,'$.status')='Final' AND json_extract(NEW.data,'$.eventId')<>'all' AND EXISTS (
      SELECT 1 FROM records WHERE id<>NEW.id AND space=NEW.space AND kind='reports'
      AND json_extract(data,'$.eventId')=json_extract(NEW.data,'$.eventId')
      AND json_extract(data,'$.status')='Final'
    )
  );
END;
--> statement-breakpoint
CREATE TRIGGER report_delete_final_lock BEFORE DELETE ON records
WHEN OLD.kind='reports' AND json_extract(OLD.data,'$.status')='Final'
BEGIN
  SELECT RAISE(ABORT,'RESCOM_FINAL_REPORT');
END;
