package com.yardimciasistan.dealer;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
import java.util.concurrent.CancellationException;
import org.json.JSONObject;

public class DealerPhotoTest {
  @Test public void negativePreservesAlphaAndNeverChangesOriginal(){int[] source={0x80336699};int[] copy=source.clone();assertArrayEquals(new int[]{0x80cc9966},DealerPhotoPixels.apply(source,1,1,DealerPhotoPixels.Mode.NEGATIVE,()->false));assertArrayEquals(copy,source);}
  @Test public void codeModeIsGrayscaleWithExpandedContrast(){int[] result=DealerPhotoPixels.apply(new int[]{0xff202020,0xffe0e0e0},2,1,DealerPhotoPixels.Mode.CODE,()->false);assertEquals(0xff000000,result[0]);assertEquals(0xffffffff,result[1]);}
  @Test public void detailOpensShadowsAndSharpensLocalFeatures(){int[] shadow=new int[9];Arrays.fill(shadow,0xff202020);assertTrue((DealerPhotoPixels.apply(shadow,3,3,DealerPhotoPixels.Mode.DETAIL,()->false)[4]&255)>32);int[] feature=new int[9];Arrays.fill(feature,0xff646464);feature[4]=0xffbebebe;assertTrue((DealerPhotoPixels.apply(feature,3,3,DealerPhotoPixels.Mode.DETAIL,()->false)[4]&255)>190);}
  @Test public void contoursSeparateAnEdgeFromAUniformSurface(){int[] flat=new int[9];Arrays.fill(flat,0xff777777);assertEquals(0xff000000,DealerPhotoPixels.apply(flat,3,3,DealerPhotoPixels.Mode.EDGE,()->false)[4]);int[] step={0xff000000,0xff000000,0xffffffff,0xff000000,0xff000000,0xffffffff,0xff000000,0xff000000,0xffffffff};assertEquals(0xffffffff,DealerPhotoPixels.apply(step,3,3,DealerPhotoPixels.Mode.EDGE,()->false)[4]);}
  @Test public void obsoleteFilterWorkCanStopBeforeProducingAnotherImage(){assertThrows(CancellationException.class,()->DealerPhotoPixels.apply(new int[9],3,3,DealerPhotoPixels.Mode.EDGE,()->true));}
  @Test public void largeFilesAreSampledBeforePixelAllocation(){assertEquals(4,DealerPhotoPixels.sample(8192,6144,2048));assertThrows(IllegalArgumentException.class,()->DealerPhotoPixels.sample(100001,100001,2048));assertThrows(IllegalArgumentException.class,()->DealerPhotoPixels.sample(-1,-1,1024));}
  @Test public void zoomAnchorsAtTheFingerAndPanStaysInsideThePhoto(){DealerPhotoTransform t=new DealerPhotoTransform();t.size(400,400,800,800);t.scale(2,100,200);assertEquals(100,t.x,.01);assertEquals(0,t.y,.01);t.pan(10000,-10000);assertEquals(200,t.x,.01);assertEquals(-200,t.y,.01);t.scale(100,200,200);assertEquals(8,t.zoom,.01);t.reset();assertEquals(1,t.zoom,.01);assertEquals(0,t.x,.01);}
  @Test public void quarterTurnFitsRotatedDimensionsAndAlignmentCanMoveAFittedPhoto(){DealerPhotoTransform t=new DealerPhotoTransform();t.size(400,300,800,400);assertEquals(.5,t.fit(),.001);t.rotate();assertEquals(.375,t.fit(),.001);assertEquals(90,t.rotation);t.pan(40,40);assertEquals(0,t.x,.01);t.alignment=true;t.pan(40,40);assertEquals(40,t.x,.01);t.rotate();t.rotate();t.rotate();assertEquals(0,t.rotation);}
  @Test public void galleryUsesOnlyDistinctPublishedHttpsImages()throws Exception{JSONObject p=new JSONObject("{\"image_url\":\"https://photos.example/a.jpg\",\"image_urls\":[\"https://photos.example/a.jpg\",\"https://photos.example/b.jpg\",\"http://photos.example/c.jpg\",\"file:///local.jpg\"]}");assertEquals(Arrays.asList("https://photos.example/a.jpg","https://photos.example/b.jpg"),DealerPhotoViewer.sources(p));assertTrue(DealerPhotoViewer.sources(new JSONObject()).isEmpty());}
}
