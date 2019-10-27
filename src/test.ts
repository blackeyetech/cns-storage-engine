import { CNStorageEngine } from "./main";

(async () => {
  let app = new CNStorageEngine("test");
  await app.init();

  // await app.write("test1", "key1", "value1");
  // await app.write("test1", "key2", "value2");
  // await app.write("test1", "key3", "value3");
  // await app.write("test1", "key4", "value4");
  // await app.write("test1", "key5", "value5");
  // await app.write("test2", "key1", "value2");
  // await app.write("test3", "key1", "value3");
  // await app.write("test4", "key1", "value4");
})();
