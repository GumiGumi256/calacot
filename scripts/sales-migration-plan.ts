/** Split only top-level SQL statements, preserving quoted PL/pgSQL bodies and comments. */
export function splitSql(source: string): string[] {
  const result:string[]=[];
  let start=0, quote="", dollar="", line=false, block=0;
  for(let i=0;i<source.length;i++) {
    const c=source[i], next=source[i+1];
    if(line){if(c==='\n')line=false;continue;}
    if(block){if(c==='/'&&next==='*'){block++;i++;}else if(c==='*'&&next==='/'){block--;i++;}continue;}
    if(dollar){if(source.startsWith(dollar,i)){i+=dollar.length-1;dollar="";}continue;}
    if(quote){if(c===quote){if(next===quote)i++;else quote="";}continue;}
    if(c==='-'&&next==='-'){line=true;i++;continue;}
    if(c==='/'&&next==='*'){block++;i++;continue;}
    if(c==="'"||c==='"'){quote=c;continue;}
    if(c==='$'){const match=/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/.exec(source.slice(i));if(match){dollar=match[0];i+=dollar.length-1;continue;}}
    if(c===';'){result.push(source.slice(start,i+1));start=i+1;}
  }
  if(quote||dollar||block)throw new Error("Unterminated SQL quote/comment");
  if(source.slice(start).replace(/--[^\n]*/g,'').trim())result.push(source.slice(start));
  return result.filter(s=>s.replace(/--[^\n]*/g,'').trim());
}
const literal=(s:string)=>"'"+s.replaceAll("'","''")+"'";
export function resumableStatement(source:string):string {
  const statement=source.replace(/--[^\n]*/g,'').trim();
  if(/^CREATE TABLE /i.test(statement))return statement.replace(/^CREATE TABLE /i,"CREATE TABLE IF NOT EXISTS ");
  if(/^CREATE (UNIQUE )?INDEX /i.test(statement))return statement.replace(/^(CREATE (?:UNIQUE )?INDEX) /i,"$1 IF NOT EXISTS ");
  if(/^ALTER TABLE .* ADD COLUMN /i.test(statement))return statement.replace(/ ADD COLUMN /i," ADD COLUMN IF NOT EXISTS ");
  const constraint=/^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)"/i.exec(statement);
  if(constraint)return `DO $resume$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=${literal('public."'+constraint[1]+'"')}::regclass AND conname=${literal(constraint[2].slice(0,63))}) THEN ${statement} END IF; END $resume$;`;
  const trigger=/^CREATE TRIGGER (\w+).*? ON (\w+) /i.exec(statement);
  if(trigger)return `DO $resume$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid=${literal('public.'+trigger[2])}::regclass AND tgname=${literal(trigger[1])} AND NOT tgisinternal) THEN ${statement} END IF; END $resume$;`;
  if(/^CREATE OR REPLACE FUNCTION /i.test(statement))return statement;
  throw new Error("Unsupported migration statement; review required before execution");
}
