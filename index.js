const rxIsInt = /^\d+$/;
const rxIsFloat = /^\d*\.\d+$|^\d+\.\d*$/;
const rxNeedsQuoting = /^\s|\s$|,|"|\n/;

function chomp (s, lineterminator) {
    if (s.charAt(s.length - lineterminator.length) !== lineterminator) {
        // Does not end with \n, just return string
        return s;
    } else {
        // Remove the \n
        return s.substring(0, s.length - lineterminator.length);
    }
}

function normalizeLineTerminator (csvString) {
    return csvString.replace(/(\r\n|\n|\r)/gm, "\n");
}

function getColumnName (i) {
  let name = '';
  while (i) {
    let k = i%26
    name = String.fromCharCode(65 + k) + name;
    i -= k;
  }
  return '__col_'+name;
}

function parse (s, options) {

    let out = [];

    const opt = Object.assign({
      headers: true,
      lineTerminator: 'auto',
      delimiter: ",",
      //doublequote: true,
      quoteChar: '"',
      skipInitialSpace: true,
      skipInitialRows: 0,
      skipEmptyValues: true,
      skipEmptyRows: true
    }, options);

    // When line terminator is not provided then we try to guess it
    // and normalize it across the file.
    if (opt.lineTerminator === 'auto') {
      s = normalizeLineTerminator(s);
      opt.lineTerminator = '\n';
    }
    // Get rid of any trailing \n
    s = chomp(s, opt.lineTerminator); 

    s = s.replace(/\ufffd/g, ' ');
    
    let cur = ""; // The character we are currently processing.
    let inQuote = false;
    let fieldQuoted = false;
    let headers = (Array.isArray(opt.headers)) ? opt.headers : false; // headers as array is not really supported as they are overwritten
    let row = [];
    let field = '';
    let emptyRow = true;
    let skipInitialRows = opt.skipInitialRows || 0;

    const processField = field => {
        if (!fieldQuoted) {
            // If field is empty set to null
            if (field === "") {
                field = null;
                // If the field was not quoted and we are trimming fields, trim it
            } else if (opt.skipInitialSpace) {
                field = field.trim();
            }

            // Convert unquoted numbers to their appropriate types
            if (rxIsInt.test(field)) {
                field = parseInt(field, 10);
            } else if (rxIsFloat.test(field)) {
                field = parseFloat(field, 10);
            }
        }
        return field;
    };

    const addRow = row => {
      if (opt.headers) {
          if (!headers) {
              for (let i in row)
                if (!row[i])
                  row[i] = getColumnName(i);
              headers = row;
          } else {
              out.push(headers.reduce((obj, key, i) => {
                if (key) {
                  if (row[i] || !opt.skipEmptyValues)
                      obj[key] = row[i];
                }
                return obj;
              }, {}))
          }
      } else {
          out.push(row);
      }
    };

    for (let i=0; i<s.length; i++) {
      cur = s.charAt(i);
      // If we are at a EOF or EOR
      if (!inQuote && (cur === opt.delimiter || cur === opt.lineTerminator)) {
        field = processField(field);

        // Add the current field to the current row
        row.push(field);
        // If this is EOR append row to output and flush row
        if (cur === opt.lineTerminator) {
          if (!skipInitialRows) {
            if (!opt.skipEmptyRows || !emptyRow) {
              addRow(row);
            }
          } else {
            skipInitialRows--;
          }
          
          row = [];
          emptyRow = true;
        }
        // Flush the field buffer
        field = "";
        fieldQuoted = false;
      } else {
        emptyRow = false;
        // If it's not a quotechar, add it to the field buffer
        if (cur !== opt.quoteChar) {
          field += cur;
        } else {
          if (!inQuote) {
            // We are not in a quote, start a quote
            inQuote = true;
            fieldQuoted = true;
          } else {
            // Next char is quotechar, this is an escaped quotechar
            if (s.charAt(i + 1) === opt.quoteChar) {
              field += opt.quoteChar;
              // Skip the next char
              i++;
            } else {
              // It's not escaping, so end quote
              inQuote = false;
            }
          }
        }
      }
    }

    // Add the last field
    field = processField(field);
    row.push(field);
    addRow(row);

    return out;
}

export function parseCSVFile (file, options) {
    const reader = new FileReader();
    const encoding = options.encoding || "UTF-8";

    let promise = new Promise ((resolve, reject) => {
        reader.onload = e => resolve(parse(e.target.result, options));
        reader.onerror = e => reject({error: {message: "Failed to load file. Code: " + e.target.error.code }});
    });
    reader.readAsText(file, encoding);
    return promise;
}

export default parseCSVFile;
/*
fetch = function(dataset) {
    var dfd = new Deferred();
    if (dataset.file) {
      var reader = new FileReader();
      var encoding = dataset.encoding || "UTF-8";
      reader.onload = function(e) {
        var out = my.extractFields(my.parse(e.target.result, dataset), dataset);
        out.useMemoryStore = true;
        out.metadata = {
          filename: dataset.file.name
        };
        dfd.resolve(out);
      };
      reader.onerror = function(e) {
        dfd.reject({
          error: {
            message: "Failed to load file. Code: " + e.target.error.code
          }
        });
      };
      reader.readAsText(dataset.file, encoding);
    } else if (dataset.data) {
      var out = my.extractFields(my.parse(dataset.data, dataset), dataset);
      out.useMemoryStore = true;
      dfd.resolve(out);
    } else if (dataset.url) {
      var fetch =
        window.fetch ||
        function(url) {
          var jq = jQuery.get(url);

          var promiseResult = {
            then: function(res) {
              jq.done(res);
              return promiseResult;
            },
            catch: function(rej) {
              jq.fail(rej);
              return promiseResult;
            }
          };
          return promiseResult;
        };
      fetch(dataset.url)
        .then(function(response) {
          if (response.text) {
            return response.text();
          } else {
            return response;
          }
        })
        .then(function(data) {
          var out = my.extractFields(my.parse(data, dataset), dataset);
          out.useMemoryStore = true;
          dfd.resolve(out);
        })
        .catch(function(req, status) {
          dfd.reject({
            error: {
              message: "Failed to load file. " +
                req.statusText +
                ". Code: " +
                req.status,
              request: req
            }
          });
        });
    }
    return dfd.promise();
  };

  // Convert array of rows in { records: [ ...] , fields: [ ... ] }
  // @param {Boolean} noHeaderRow If true assume that first row is not a header (i.e. list of fields but is data.
  my.

  my.

  // ## parse
  //
  // For docs see the README
  //
  // Heavily based on uselesscode's JS CSV parser (MIT Licensed):
  // http://www.uselesscode.org/javascript/csv/
  my.

  my.

  my.objectToArray = function(dataToSerialize) {
    var a = [];
    var fieldNames = [];
    for (var ii = 0; ii < dataToSerialize.fields.length; ii++) {
      fieldNames.push(dataToSerialize.fields[ii].id);
    }
    a.push(fieldNames);
    for (var ii = 0; ii < dataToSerialize.records.length; ii++) {
      var tmp = [];
      var record = dataToSerialize.records[ii];
      for (var jj = 0; jj < fieldNames.length; jj++) {
        tmp.push(record[fieldNames[jj]]);
      }
      a.push(tmp);
    }
    return a;
  };

  // ## serialize
  //
  // See README for docs
  //
  // Heavily based on uselesscode's JS CSV serializer (MIT Licensed):
  // http://www.uselesscode.org/javascript/csv/
  my.serialize = function(dataToSerialize, dialect) {
    var a = null;
    if (dataToSerialize instanceof Array) {
      a = dataToSerialize;
    } else {
      a = my.objectToArray(dataToSerialize);
    }
    var options = my.normalizeDialectOptions(dialect);

    var cur = "", // The character we are currently processing.
        field = "", // Buffer for building up the current field
        row = "",
        out = "",
        i,
        j,
        processField;

    processField = function(field) {
      if (field === null) {
        // If field is null set to empty string
        field = "";
      } else if (typeof field === "string" && rxNeedsQuoting.test(field)) {
        if (options.doublequote) {
          field = field.replace(/"/g, '""');
        }
        // Convert string to delimited string
        field = options.quotechar + field + options.quotechar;
      } else if (typeof field === "number") {
        // Convert number to string
        field = field.toString(10);
      }

      return field;
    };

    for (i = 0; i < a.length; i += 1) {
      cur = a[i];

      for (j = 0; j < cur.length; j += 1) {
        field = processField(cur[j]);
        // If this is EOR append row to output and flush row
        if (j === cur.length - 1) {
          row += field;
          out += row + options.lineterminator;
          row = "";
        } else {
          // Add the current field to the current row
          row += field + options.delimiter;
        }
        // Flush the field buffer
        field = "";
      }
    }

    return out;
  };
*/  