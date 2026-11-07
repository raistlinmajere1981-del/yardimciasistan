package com.yardimciasistan.dealer;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.Arrays;
import org.json.JSONObject;

public class DealerPhotoTest {
  @Test public void galleryUsesOnlyDistinctPublishedHttpsImages()throws Exception{JSONObject p=new JSONObject("{\"image_url\":\"https://photos.example/a.jpg\",\"image_urls\":[\"https://photos.example/a.jpg\",\"https://photos.example/b.jpg\",\"http://photos.example/c.jpg\",\"file:///local.jpg\"]}");assertEquals(Arrays.asList("https://photos.example/a.jpg","https://photos.example/b.jpg"),DealerPhotoViewer.sources(p));assertTrue(DealerPhotoViewer.sources(new JSONObject()).isEmpty());}
}
