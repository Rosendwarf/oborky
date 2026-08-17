import os
import re
import json
from pathlib import Path
from pypdf import PdfReader

ACTIVE_PDF_DIR = Path("data/pdf/soucasne")
LEGACY_PDF_DIR = Path("data/pdf/legacy")

ACTIVE_OUTPUT_PATH = Path("data/badges.json")
LEGACY_OUTPUT_PATH = Path("data/badges_legacy.json")

CAT_MAP = {
    'TECHNICKÉ': 'Technické', 'SPORTOVNÍ': 'Sportovní', 'UMĚLECKÉ': 'Umělecké',
    'PŘÍRODOVĚDECKÉ': 'Přírodovědné', 'PŘÍRODOVĚDNÉ': 'Přírodovědné',
    'TÁBORNICKO-CESTOVATELSKÉ': 'Tábornicko-cestovatelské', 'TÁBORNICKO - CESTOVATELSKÉ': 'Tábornicko-cestovatelské',
    'HUMANITNÍ': 'Humanitní', 'SLUŽBA BLIŽNÍM': 'Služba bližním', 'VODÁCKÉ': 'Vodácké',
    'ŽIVOT V ODDÍLE': 'Život v oddíle', 'DUCHOVNÍ': 'Duchovní'
}

def clean_text(text):
    if not text: return ""
    text = re.sub(r'([a-záčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])-[\s]+([a-záčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ])', r'\1\2', text)
    text = text.replace('ﬂ ash', 'flash').replace('ﬁ lm', 'film').replace('graﬁ c', 'grafic')
    text = text.replace('ﬂ ', 'fl').replace('ﬁ ', 'fi').replace('ﬂ', 'fl').replace('ﬁ', 'fi')
    return re.sub(r'\s+', ' ', text).strip()

def slugify(text):
    text = text.lower()
    chars = {
        'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o',
        'ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z','/':'-',' ':'-'
    }
    for k, v in chars.items():
        text = text.replace(k, v)
    text = re.sub(r'[^a-z0-9\-]', '', text)
    return re.sub(r'\-+', '-', text).strip('-')

def format_title_from_filename(filename_stem):
    clean_name = filename_stem.replace('_', ' ').replace('-', ' ')
    words = clean_name.split()
    formatted_words = [w.capitalize() for w in words]
    return " ".join(formatted_words)

def is_fake_task(letter, text_body):
    body_lower = text_body.lower().strip()
    fakes = {
        'c': ['íl:', 'il:', 'íl', 'il ', 'elkem', 'ervená'],
        'p': ['opis aktivity', 'očty ke splnění', 'odpisy', 'ro ', 'okud již'],
        'd': ['okaž to', 'uchovní', 'oplňující'],
        'u': ['kaž se', 'mělecké'],
        's': ['kautská odborka', 'portovní', 'lužba bližním', 'tarší', 'plněno'],
        'z': ['adání aktivity', 'apiš si do', 'elená'],
        't': ['echnické', 'ábornicko', 'ato aktivita'],
        'h': ['umanitní', 'lavní podmínky'],
        'v': ['odácké', 'kategorii'],
        'ž': ['ivot v oddíle', 'e znám'],
        'o': ['ranžová', 'dborka'],
        'm': ['ám splněno', 'oje jméno', 'ůj patron', 'ladší', 'oc'],
        'j': ['á', 'ednoduchá', 'ejí plnění'],
        'a': ['ktivity']
    }
    
    if letter.lower() in fakes:
        for fake_str in fakes[letter.lower()]:
            if body_lower.startswith(fake_str):
                return True
                
    if "patron" in body_lower[:15] and len(body_lower) < 20: return True
    if body_lower.startswith("co plněním"): return True
    return False

def parse_single_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    pages = [p.extract_text() or "" for p in reader.pages]
    full_text = "\n".join(pages)
    p0_text = pages[0] if pages else ""

    if "POČTY KE SPLNĚNÍ ODBORKY" not in full_text and "DOKAŽ TO" not in full_text:
        return None

    slug = slugify(pdf_path.stem)
    title = format_title_from_filename(pdf_path.stem)

    category = "Přírodovědné"
    for cat_raw, cat_name in CAT_MAP.items():
        if cat_raw in full_text:
            category = cat_name
            break

    desc = ""
    m_cil = re.search(r'CÍL:\s*(.*?)(?=\n\s*(?:POČTY KE SPLNĚNÍ|DOKAŽ TO|UKAŽ SE|ZADÁNÍ AKTIVITY|POPIS AKTIVITY)|\Z)', full_text, re.DOTALL | re.IGNORECASE)
    
    if m_cil:
        raw_desc = m_cil.group(1)
    else:
        m_fallback = re.search(r'(?:CÍL[:\s]*)?(.*?)(?=\n\s*(?:POČTY KE SPLNĚNÍ|DOKAŽ TO|UKAŽ SE|ZADÁNÍ AKTIVITY|POPIS AKTIVITY)|\Z)', full_text, re.DOTALL | re.IGNORECASE)
        raw_desc = m_fallback.group(1) if m_fallback else ""

    if raw_desc:
        raw_desc = clean_text(raw_desc)
        stop_triggers = [
            "Měli by vědět", "Skautská odborka", "Mám splněno", 
            "Zapiš si", "Zelená –", "Oranžová –", "Červená –", "Pokud již máš"
        ]
        for trigger in stop_triggers:
            idx = raw_desc.find(trigger)
            if idx != -1 and idx > 20:
                raw_desc = raw_desc[:idx]
                
        desc = clean_text(raw_desc)
        sentences = re.split(r'(?<=[.!?])\s+', desc)
        if len(sentences) > 4:
            desc = " ".join(sentences[:3])

    dt_pages = [p for p in pages if "ZADÁNÍ AKTIVITY" in p or "CO PLNĚNÍM AKTIVITY" in p]
    if not dt_pages: dt_pages = pages

    dokaz_to = []
    for p in dt_pages:
        p_mod = re.sub(r'Patron/ka([A-Z])', r'Patron/ka\n\1', p)
        p_mod = re.sub(r'Patron([A-Z])', r'Patron\n\1', p_mod)
        p_mod = re.sub(r'Já([A-Z])', r'Já\n\1', p_mod)

        dt_matches = re.findall(r'(?:^|\n)\s*([A-Z])\s*\n\s*([^\n•]+(?:\n(?!\s*[A-Z]\s*\n|\s*•|\s*Já\s*\n\s*Patron|\s*CO PLNĚNÍM)[^\n•]+)*)', p_mod)
        for letter, t_body in dt_matches:
            t_clean = clean_text(t_body)
            t_clean = re.split(r'(?:•|Já\s+Patron|CO PLNĚNÍM)', t_clean)[0].strip()
            
            if is_fake_task(letter, t_clean):
                continue
                
            if len(t_clean) > 5 and not t_clean.startswith("CO PLNĚNÍM") and not t_clean.startswith("PODPISY"):
                dokaz_to.append({
                    "id": f"dt_{letter.lower()}",
                    "title": f"{letter}. {t_clean}" if not t_clean.startswith(f"{letter}.") else t_clean
                })

    us_pages = [p for p in pages if "POPIS AKTIVITY" in p or "UKAŽ SE" in p]
    ukaz_se = []
    for p in us_pages:
        p_mod = re.sub(r'Patron/ka(\d+)', r'Patron/ka\n\1', p)
        p_mod = re.sub(r'Patron(\d+)', r'Patron\n\1', p_mod)
        p_mod = re.sub(r'Já(\d+)', r'Já\n\1', p_mod)

        us_matches = re.findall(r'(?:^|\n)\s*(\d{1,2})\s*\n\s*([^\n]+(?:\n(?!\s*\d{1,2}\s*\n|\s*Já\s*\n\s*Patron|\s*DOKAŽ TO|\s*UKAŽ SE|\s*Skautská odborka|\s*ZADÁNÍ AKTIVITY|\s*CÍL)[^\n]+)*)', p_mod)
        for num, t_body in us_matches:
            t_clean = clean_text(t_body)
            t_clean = re.split(r'(?:Já\s+Patron|PODPISY)', t_clean)[0].strip()
            
            if is_fake_task('x', t_clean): 
                continue

            if len(t_clean) > 3 and not t_clean.startswith("Já"):
                ukaz_se.append({
                    "id": f"us_{num}",
                    "title": f"{num}. {t_clean}" if not t_clean.startswith(f"{num}.") else t_clean
                })

    dt_dict = {}
    for item in dokaz_to:
        if item["id"] not in dt_dict: dt_dict[item["id"]] = item["title"]
    dedup_dt = [{"id": k, "title": v} for k, v in sorted(dt_dict.items())]

    us_dict = {}
    for item in ukaz_se:
        if item["id"] not in us_dict: us_dict[item["id"]] = item["title"]
    dedup_us = [{"id": k, "title": v} for k, v in sorted(us_dict.items(), key=lambda x: int(x[0].split('_')[1]))]

    num_dt = len(dedup_dt)
    if num_dt < 2 or len(dedup_us) < 2:
        return None

    req_numbers = re.findall(r'\((\d+)\)', p0_text)
    requirements = {
        "mladsi_skauti": {"dokaz_to": 3, "ukaz_se": 2},
        "starsi_skauti": {"dokaz_to": 6, "ukaz_se": 4},
        "roveri": {"dokaz_to": 9, "ukaz_se": 5}
    }
    
    if len(req_numbers) >= 6:
        col1 = [int(x) for x in req_numbers[0:3]]
        col2 = [int(x) for x in req_numbers[3:6]]
        
        if col1[2] > num_dt:
            us_req, dt_req = col1, col2
        elif col2[2] > num_dt:
            dt_req, us_req = col1, col2
        else:
            us_req, dt_req = col1, col2
            
        requirements = {
            "mladsi_skauti": {"dokaz_to": dt_req[0], "ukaz_se": us_req[0]},
            "starsi_skauti": {"dokaz_to": dt_req[1], "ukaz_se": us_req[1]},
            "roveri": {"dokaz_to": dt_req[2], "ukaz_se": us_req[2]}
        }

    return {
        "id": slug,
        "url": slug,  # URL template (název bez diakritiky, mezery a podtržítka nahrazeny pomlčkou)
        "name": title,
        "category": category,
        "description": desc,
        "requirements": requirements,
        "tasks": {
            "dokaz_to": dedup_dt,
            "ukaz_se": dedup_us
        }
    }

def process_directory(directory_path):
    badges_dict = {}
    if not directory_path.exists():
        return badges_dict

    pdf_files = list(directory_path.glob("*.pdf"))
    for pdf_path in pdf_files:
        badge = parse_single_pdf(pdf_path)
        if badge:
            badges_dict[badge["id"]] = badge
            
    return badges_dict

def main():
    active_badges = process_directory(ACTIVE_PDF_DIR)
    ACTIVE_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(ACTIVE_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(active_badges, f, ensure_ascii=False, indent=2)

    legacy_badges = process_directory(LEGACY_PDF_DIR)
    LEGACY_OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LEGACY_OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(legacy_badges, f, ensure_ascii=False, indent=2)

if __name__ == "__main__":
    main()