"""Import employees directly from the saved CSV file usi""
import csv
import re
import sq
import uuid
from datetime import datetime

DB_PATH = "flash_erp.db"

def normalize_header(h):
    s = (h or "").strip().lower()
    s = s.replace("#", " no")
    s = s.replace("/", " ")
    s = s.replace("&", " and ")
    s = re.sub(r"\s+

    return s.strip()

def sanitize_phone(
    if not v:
        return None
tr(v))
    return s if s elsee

def sanitize_money(v):
    if not v:
        e
    s = re.sub(r"[^\d.]", "", str(v))
    try:
        return str( None

        return None

def parse_date(v):
    if not v:
        return None
    s = str(v).stri()
    if not s or s.lower() in ("nil", "n/a", "-", "for life"):
        retune
    for fmt in ["%d-%b-%Y", "%d/%b/%Y", "%Y-%m-%d", "%d-%m-%Y", "/%Y"]:
        try:
            return d)
        except:
ontinue
    return None

def split_name(full_name):
    parts = (full_name or ""
    if len(parts) == 0:
        return "Unknown", ""
    if len(parts) == 1:
], ""
    return parts[0], " ".join(parts[1:])

def main():
    print("=" * 60)
    print("IMPORTING E")
    print("=" * 60)
  
    conn = 
    cursor = conn.c()
    
    # Get current mion
    ployees")
    counter = cursor.fe100
    
    # Getion
    cursor.execute("SELECT cnic FROM employees WHERE cnic IS NOT NULL")
    existing_cnics = {row[0] for r
    
    cursULL")
    existing_fss = {row[0etchall()}
    
    try:
        with open("employee_import_data.csv", "r", encoding="utf
            reader = csv.reader(f)
            rows = list(reader)
        
        
        header_idx = 0
        for i, r in enumerate(rows[:10]):
        
            if "name" in joined and "cnic" in joined:
                header_idx = i
        k
        
        headers = [
        data_rows =:]
        
        
        print(f"Headers: {headers[:10]}...")
        print(f"Existing employees: {len(existing_cnics)} rs")
        
        crea0
        skipped = 0
        errors = [
        
        for idx, row in enumerate(data:
            if not any(str(x or "in row):
            
            
            # Build row dict
            r = {}
            for j, h in enumers):
                :
                    r[h] = row[j]
            
            try:
                
                if not full_name:
                    cont
                
                first_name, last)
                cnic = str(r.get("cn None
                fss_no = str(r.ge
                
                # Check fotes
                if cnic and cnic in existing_cnics:
                    skipped += 1
                    continue
                
                ss:
                    skipped += 1
                    continue
                
                
                email_base = f"{first_name.lower()}.{last_name."")
                email = f"{e
                
                counter += 1
                
                # Insert employee
                cursor.execute("""
                    INSERT INTO ployees (
                        employee_id, first_name, last_name, email, father_name,
                        total_salary, employment_status, service_,
                        blood_group, cnic, date,
                        original_doc_held, documents_handed_over_to, photoent,
                        eobi_no, insurance, social_security, mobile_number
                        particulars_verified_by_sho_on, police_khidmat_verifi
                        domiciate,
                        service_reenrollment_date, permanenice,
                        permanent_thana, permanent_tehsil, permanenttion,
                        police_training_letter_date, vaccination_certificate, volume_no,
                        payments, fss_number, designation, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    employee_id,
                    first_name,
                    last_name,
                    email,
                    str(r.get("fathers name") or "").strip() or None,
                    sanitize_money(r.get("salary")),
                    "Active",
                    str(r.get("unit") or "").strip() or None,
                    str(r.get("rank") or "").strip() or None,
                    str(r.get("blood gp") or "").strip() or None,
                    cnic,
                    parse_date(r.get("dob")),
                    parse_date(r.get("cnic expr")),
                    str(r.get("documents held") or "").strip() or None,
                    str(r.get("documents reciving handed over to") or "").strip() orone,
                    str(r.get("photo on docu") or "").strip() or None,
                    str(r.get("eobi no") or "").strip() or None,
                    str(r.get("insurance") or "").strip() or None,
                    str(r.get("social security") or "").strip() or None,
                    sanitize_phone(r.get("mob no")),
                    sanitize_phone(r.g,
                    parse_date(r.get("verified by sho")),
                 ,
                e,
                    parse_d
                    parse_d),
                    parse_da")),
                ne,
                    str(r.get("post oor None,
                    str(r.get("thana") or "").strip() or Non
                    ,
                    str(r.get("dis
                    str(r.get("duty location") o
                    str(r.get,
        None,
                    str(r.get(,
                    str(r.get("pa
                    fss_no,
                    str(r.get("rank" or None,
                    datetime.now().isoformat(),
                ))
               
                # Traccation
                if cnic:
                    existing_cnic)
                if fss_no:
                
            
                crd += 1
   
                if created
          mmit()
)
main(":
    ain___m_ == "_
if __name_.close()
   conn     inally:
 f     
        
      ")f"  - {e}   print(       ]:
      rrors[:5 ee in   for )
         rs:"st 5 erro\nFirt("in pr           rrors[:5]:
 e     if    
 ")
      ors)}(err{lenErrors: (f"print       ")
 ): {skipped}uplicatesed (dSkipp(f"int  pr")
      d}: {createt(f"Createdin  pr
      * 60}")=' "{'   print(f
     LETE")T COMPIMPOR"     print(f")
    60} *t(f"\n{'='   prin
     ()
        .commit     conn       
 {e}")
    {idx}: nd(f"Rowors.appe        err  s e:
      ion acept Except     ex 
                    ")
      oyees...eated} empl {crted"Crea     print(f               