from bs4 import BeautifulSoup

from app.providers.parsing import extract_structured_menu


def test_jsonld_graph_and_nested_item_list_are_parsed():
    html = '''<script type="application/ld+json">{
      "@context":"https://schema.org",
      "@graph":[{
        "@type":"Menu",
        "hasMenuItem":[{
          "@type":"MenuItem",
          "name":"Paneer Tikka",
          "url":"https://www.swiggy.com/city/agra/paneer-tikka",
          "offers":{"price":"249"},
          "suitableForDiet":"http://schema.org/VegetarianDiet"
        }]
      }]
    }</script>'''
    offers = extract_structured_menu(Soup := BeautifulSoup(html, "html.parser"), "Cafe", "https://www.swiggy.com/city/agra")
    assert len(offers) == 1
    assert offers[0].dish_url.endswith("paneer-tikka")
    assert offers[0].vegetarian_verified is True
