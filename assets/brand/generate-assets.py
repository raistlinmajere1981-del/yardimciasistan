from PIL import Image, ImageDraw, ImageFont, ImageFilter
from collections import deque
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
BOARD=ROOT/"newlogo.png"
SOURCE_BOX=(565,37,923,372)

def extract_mark():
    image=Image.open(BOARD).convert("RGB").crop(SOURCE_BOX)
    w,h=image.size
    p=image.load()
    colored=bytearray(w*h)
    for y in range(h):
        for x in range(w):
            r,g,b=p[x,y]
            if b-r>=35 and b>=g-19 and max(r,g,b)-min(r,g,b)>=36 and b>=105:
                colored[y*w+x]=1
    # Keep only connected mascot, excluding background text/decorative accents.
    seen=bytearray(w*h); components=[]
    for i in range(w*h):
        if not colored[i] or seen[i]:continue
        seen[i]=1; q=[i];k=0
        while k<len(q):
            cur=q[k];k+=1
            cy,cx=divmod(cur,w)
            for xx,yy in ((cx-1,cy),(cx+1,cy),(cx,cy-1),(cx,cy+1),(cx-1,cy-1),(cx+1,cy+1),(cx-1,cy+1),(cx+1,cy-1)):
                if 0<=xx<w and 0<=yy<h:
                    j=yy*w+xx
                    if colored[j] and not seen[j]:seen[j]=1;q.append(j)
        components.append(q)
    biggest=max(components,key=len)
    wall=bytearray(w*h)
    for i in biggest:wall[i]=1
    # Preserve the pearly face and eyes: flood-fill the non-blue exterior, then invert.
    outside=bytearray(w*h);q=deque()
    for x in range(w):
        for y in (0,h-1):
            i=y*w+x
            if not wall[i] and not outside[i]:outside[i]=1;q.append(i)
    for y in range(h):
        for x in (0,w-1):
            i=y*w+x
            if not wall[i] and not outside[i]:outside[i]=1;q.append(i)
    while q:
        i=q.popleft();y,x=divmod(i,w)
        for xx,yy in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0<=xx<w and 0<=yy<h:
                j=yy*w+xx
                if not wall[j] and not outside[j]:outside[j]=1;q.append(j)
    mask=Image.new("L",(w,h))
    mask.putdata([0 if outside[i] else 255 for i in range(w*h)])
    # Feather only the silhouette edge for natural antialiasing.
    mask=mask.filter(ImageFilter.GaussianBlur(.7))
    # Remove the separate pale ground shadow painted into the source concept board.
    md=list(mask.getdata())
    for yy in range(max(0,h-34),h):
        for xx in range(w):
            rr,gg,bb=p[xx,yy]
            if bb-rr < 68 and gg-rr < 60:
                md[yy*w+xx]=0
    mask.putdata(md)
    result=image.convert("RGBA")
    result.putalpha(mask)
    bb=result.getbbox()
    return result.crop(bb)

def fit_square(art, pixels, ratio=.83):
    square=Image.new("RGBA",(pixels,pixels))
    target=int(pixels*ratio)
    scale=min(target/art.width,target/art.height)
    sz=(max(1,int(art.width*scale)), max(1,int(art.height*scale)))
    icon=art.resize(sz,Image.Resampling.LANCZOS)
    square.alpha_composite(icon,((pixels-sz[0])//2,(pixels-sz[1])//2))
    return square

def app_icon(art,pixels):
    # Shared transparent silhouette for desktop, web and Android legacy launchers.
    # Do not paint a rounded tile: the OS/launcher controls icon framing.
    return fit_square(art,pixels,.87)

def font(n):
    return ImageFont.truetype("/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",n)

def lockup(art, width=720,height=289):
    img=Image.new("RGBA",(width,height))
    icon=fit_square(art,height-8,.88)
    img.alpha_composite(icon,(2,4))
    d=ImageDraw.Draw(img)
    left=int(height*.94)
    top=54
    f=font(72)
    d.text((left,top),"Yardımcı",font=f,fill="#1E293B",stroke_width=0)
    d.text((left,top+81),"Asistan",font=f,fill="#059DC4")
    return img

def save(image,relative):
    p=ROOT/relative
    p.parent.mkdir(parents=True,exist_ok=True)
    image.save(p,optimize=True)
    print(relative,image.size,p.stat().st_size)

def main():
    mark=extract_mark()
    print("MARK",mark.size,mark.getbbox())
    save(mark, "assets/brand/yardimci-asistan-mark.png")
    full=lockup(mark)
    save(full, "assets/brand/yardimci-asistan-logo-full.png")
    for dir in ("apps/desktop-app/public/assets","test-site/landing/assets"):
        save(fit_square(mark,512,.87),f"{dir}/yardimci-asistan-symbol.png")
        save(full,f"{dir}/yardimci-asistan-logo.png")
    save(fit_square(mark,512,.87),"firm-template/web-module/assets/yardimci-asistan-symbol.png")
    for p in ("apps/desktop-app/public/favicon.png","test-site/landing/favicon.png"):
        save(app_icon(mark,64),p)
    save(app_icon(mark,1024),"apps/desktop-app/assets/app-icon.png")
    ico=app_icon(mark,1024)
    ico.save(ROOT/"apps/desktop-app/assets/app-icon.ico",format="ICO",sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
    print("apps/desktop-app/assets/app-icon.ico")
    save(fit_square(mark,432,.63),"apps/android-app/src/main/res/drawable/ic_launcher_foreground.png")
    for dpi,sz in (("mdpi",48),("hdpi",72),("xhdpi",96),("xxhdpi",144),("xxxhdpi",192)):
        save(app_icon(mark,sz),f"apps/android-app/src/main/res/mipmap-{dpi}/ic_launcher.png")
    # preview: mascot extracted against contrasting backgrounds and the generated lockup
    view=Image.new("RGB",(1040,540),(240,244,248));v=ImageDraw.Draw(view)
    v.rounded_rectangle((520,0,1040,540),radius=5,fill=(16,29,47))
    view.paste(fit_square(mark,430,.86),(45,48),fit_square(mark,430,.86))
    view.paste(fit_square(mark,430,.86),(560,48),fit_square(mark,430,.86))
    view.save("/tmp/ya-logo-review.png")
if __name__=="__main__":
    main()
